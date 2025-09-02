locals {
  name_prefix       = var.name_prefix
  location          = var.location
  tags              = var.tags
  admin_group_name  = var.admin_group_name
}

resource "azurerm_resource_group" "rg" {
  name     = "${local.name_prefix}-rg"
  location = local.location
  tags     = local.tags
}

# Workload user-assigned managed identity (referenced by container group)
resource "azurerm_user_assigned_identity" "workload" {
  name                = "${local.name_prefix}-uami"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  tags                = local.tags
}

resource "azurerm_virtual_network" "vnet" {
  name                = "${local.name_prefix}-vnet"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  address_space       = var.vnet_address_space
  tags                = local.tags
}

resource "azurerm_subnet" "appgw" {
  name                 = "appgw"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [var.subnet_appgw_prefix]
}

resource "azurerm_subnet" "aci" {
  name                 = "aci"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [var.subnet_aci_prefix]
}

resource "azurerm_subnet" "privatelink" {
  name                 = "privatelink"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = [var.subnet_privatelink_prefix]
}

# Random suffix used for globally-unique resource names
resource "random_string" "suffix" {
  length  = 6
  upper   = false
  numeric = true
  special = false
}

# Public IP for Application Gateway
resource "azurerm_public_ip" "appgw" {
  name                = "${local.name_prefix}-appgw-pip"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = local.tags
}

data "azuread_client_config" "current" {}

# Container Registry
resource "azurerm_container_registry" "acr" {
  name                = "${local.name_prefix}acr${random_string.suffix.result}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = false
  tags                = local.tags
}

# Key Vault (private only)
resource "azurerm_key_vault" "kv" {
  name                       = "${local.name_prefix}kv${random_string.suffix.result}"
  location                   = azurerm_resource_group.rg.location
  resource_group_name        = azurerm_resource_group.rg.name
  tenant_id                  = data.azuread_client_config.current.tenant_id
  sku_name                   = "standard"
  purge_protection_enabled   = true
  soft_delete_retention_days = 7
  public_network_access_enabled = false
  network_acls {
    default_action = "Deny"
    bypass         = "AzureServices"
  }
  tags = local.tags
}

resource "azurerm_key_vault_access_policy" "workload" {
  count        = var.key_vault_use_rbac ? 0 : 1
  key_vault_id = azurerm_key_vault.kv.id
  tenant_id    = data.azuread_client_config.current.tenant_id
  object_id    = azurerm_user_assigned_identity.workload.principal_id
  secret_permissions = ["Get", "List", "Set"]
}

# RBAC role assignment for Key Vault secrets access (if RBAC mode)
resource "azurerm_role_assignment" "kv_secrets_user" {
  count                = var.key_vault_use_rbac ? 1 : 0
  scope                = azurerm_key_vault.kv.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.workload.principal_id
}

resource "azurerm_application_gateway" "appgw" {
name                = "${local.name_prefix}-appgw"
location            = azurerm_resource_group.rg.location
resource_group_name = azurerm_resource_group.rg.name

    sku {
        name     = "WAF_v2"
        tier     = "WAF_v2"
        capacity = 1
    }

    gateway_ip_configuration {
        name      = "appgw-ipcfg"
        subnet_id = azurerm_subnet.appgw.id
    }

    frontend_ip_configuration {
        name                 = "public"
        public_ip_address_id = azurerm_public_ip.appgw.id
    }

    frontend_port {
        name = "port80"
        port = 80
    }

    dynamic "frontend_port" {
        for_each = var.appgw_enable_https ? [1] : []
        content {
        name = "port443"
        port = 443
        }
    }

    backend_address_pool {
        name         = "aci-pool"
        ip_addresses = [azurerm_container_group.app.ip_address]
    }

    probe {
        name                = "web-probe"
        protocol            = "Http"
        path                = "/"
        interval            = 30
        timeout             = 10
        unhealthy_threshold = 3
        match {
          body = null
          status_code = ["200-399"]
        }
    }

    probe {
        name                = "api-probe"
        protocol            = "Http"
        path                = "/healthz"
        interval            = 30
        timeout             = 10
        unhealthy_threshold = 3
        match {
          body = null
          status_code = ["200-399"]
        }
    }

    backend_http_settings {
        name                  = "web-settings"
        protocol              = "Http"
        port                  = 80
        request_timeout       = 30
        cookie_based_affinity = "Disabled"
        probe_name            = "web-probe"
    }

    backend_http_settings {
        name                  = "api-settings"
        protocol              = "Http"
        port                  = 8080
        request_timeout       = 30
        cookie_based_affinity = "Disabled"
        probe_name            = "api-probe"
    }

    http_listener {
        name                           = "listener80"
        frontend_ip_configuration_name = "public"
        frontend_port_name             = "port80"
        protocol                       = "Http"
    }

    dynamic "ssl_certificate" {
        for_each = var.appgw_enable_https && length(var.appgw_cert_pfx_base64) > 0 ? [1] : []
        content {
        name     = "appgwcert"
        data     = var.appgw_cert_pfx_base64
        password = var.appgw_cert_password
        }
    }

    dynamic "http_listener" {
        for_each = var.appgw_enable_https && length(var.appgw_cert_pfx_base64) > 0 ? [1] : []
        content {
        name                           = "listener443"
        frontend_ip_configuration_name = "public"
        frontend_port_name             = "port443"
        protocol                       = "Https"
        ssl_certificate_name           = "appgwcert"
        }
    }

    url_path_map {
        name                               = "api-map"
        default_backend_address_pool_name  = "aci-pool"
        default_backend_http_settings_name = "web-settings"
        path_rule {
        name                       = "api-rule"
        paths                      = ["/api/*"]
        backend_address_pool_name  = "aci-pool"
        backend_http_settings_name = "api-settings"
        }
    }

    request_routing_rule {
        name               = "rule-http-root"
        rule_type          = "Basic"
        http_listener_name = "listener80"
        url_path_map_name  = "api-map"
    }

    dynamic "request_routing_rule" {
        for_each = var.appgw_enable_https && length(var.appgw_cert_pfx_base64) > 0 ? [1] : []
        content {
        name               = "rule-https-root"
        rule_type          = "Basic"
        http_listener_name = "listener443"
        url_path_map_name  = "api-map"
        }
    }
    # Redirect HTTP to HTTPS when HTTPS enabled (listener-based redirect)
    dynamic "redirect_configuration" {
      for_each = var.appgw_enable_https && length(var.appgw_cert_pfx_base64) > 0 ? [1] : []
      content {
        name                 = "http-to-https"
        redirect_type        = "Permanent"
        target_listener_name = "listener443"
        include_path         = true
        include_query_string = true
      }
    }
    dynamic "request_routing_rule" {
      for_each = var.appgw_enable_https && length(var.appgw_cert_pfx_base64) > 0 ? [1] : []
      content {
        name                       = "rule-http-redirect"
        rule_type                  = "Basic"
        http_listener_name         = "listener80"
        redirect_configuration_name = "http-to-https"
      }
    }
    tags = local.tags
}

# Container Group (API + Web)
resource "azurerm_container_group" "app" {
  name                = "${local.name_prefix}-cg"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  ip_address_type     = "Private"
  os_type             = "Linux"
  subnet_ids          = [azurerm_subnet.aci.id]
  restart_policy      = "Always"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.workload.id]
  }

  container {
    name   = "api"
    image  = "${azurerm_container_registry.acr.login_server}/selfcert-api:latest"
    cpu    = 0.5
    memory = 1.0
    ports { port = 8080 }
    environment_variables = {
      KEY_VAULT_URI        = azurerm_key_vault.kv.vault_uri
      STORAGE_ACCOUNT_NAME = azurerm_storage_account.sa.name
      CERTS_TABLE_NAME     = azurerm_storage_table.certs.name
      REVOKE_TABLE_NAME    = azurerm_storage_table.revocations.name
      ROOTCAS_TABLE_NAME   = azurerm_storage_table.rootcas.name
      AUDIT_TABLE_NAME     = azurerm_storage_table.auditlog.name
    }
  }

  container {
    name   = "web"
    image  = "${azurerm_container_registry.acr.login_server}/selfcert-web:latest"
    cpu    = 0.5
    memory = 0.5
    ports { port = 80 }
  }
  tags = local.tags
}

resource "azurerm_private_dns_zone" "kv" {
  name                = "privatelink.vaultcore.azure.net"
  resource_group_name = azurerm_resource_group.rg.name
}

# Private DNS zones for Storage (blob & table) for private endpoints
resource "azurerm_private_dns_zone" "blob" {
  name                = "privatelink.blob.core.windows.net"
  resource_group_name = azurerm_resource_group.rg.name
}
resource "azurerm_private_dns_zone" "table" {
  name                = "privatelink.table.core.windows.net"
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "kv" {
  name                  = "${local.name_prefix}-kv-link"
  resource_group_name   = azurerm_resource_group.rg.name
  private_dns_zone_name = azurerm_private_dns_zone.kv.name
  virtual_network_id    = azurerm_virtual_network.vnet.id
}

resource "azurerm_private_dns_zone_virtual_network_link" "blob" {
  name                  = "${local.name_prefix}-blob-link"
  resource_group_name   = azurerm_resource_group.rg.name
  private_dns_zone_name = azurerm_private_dns_zone.blob.name
  virtual_network_id    = azurerm_virtual_network.vnet.id
}
resource "azurerm_private_dns_zone_virtual_network_link" "table" {
  name                  = "${local.name_prefix}-table-link"
  resource_group_name   = azurerm_resource_group.rg.name
  private_dns_zone_name = azurerm_private_dns_zone.table.name
  virtual_network_id    = azurerm_virtual_network.vnet.id
}

resource "azurerm_private_endpoint" "kv" {
  name                = "${local.name_prefix}-kv-pe"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  subnet_id           = azurerm_subnet.privatelink.id

  private_service_connection {
    name                           = "kv-psc"
    private_connection_resource_id = azurerm_key_vault.kv.id
    is_manual_connection           = false
    subresource_names              = ["vault"]
  }

  private_dns_zone_group {
    name                 = "kv-dns-group"
    private_dns_zone_ids = [azurerm_private_dns_zone.kv.id]
  }
  tags = local.tags
}

# Private endpoints for Storage Account (blob & table)
resource "azurerm_private_endpoint" "sa_blob" {
  name                = "${local.name_prefix}-sa-blob-pe"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  subnet_id           = azurerm_subnet.privatelink.id

  private_service_connection {
    name                           = "sa-blob-psc"
    private_connection_resource_id = azurerm_storage_account.sa.id
    is_manual_connection           = false
    subresource_names              = ["blob"]
  }

  private_dns_zone_group {
    name                 = "blob-dns-group"
    private_dns_zone_ids = [azurerm_private_dns_zone.blob.id]
  }
  tags = local.tags
}

resource "azurerm_private_endpoint" "sa_table" {
  name                = "${local.name_prefix}-sa-table-pe"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  subnet_id           = azurerm_subnet.privatelink.id

  private_service_connection {
    name                           = "sa-table-psc"
    private_connection_resource_id = azurerm_storage_account.sa.id
    is_manual_connection           = false
    subresource_names              = ["table"]
  }

  private_dns_zone_group {
    name                 = "table-dns-group"
    private_dns_zone_ids = [azurerm_private_dns_zone.table.id]
  }
  tags = local.tags
}

# Storage for certificate metadata & revocation list
resource "azurerm_storage_account" "sa" {
  name                     = "${local.name_prefix}sa${random_string.suffix.result}"
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  allow_nested_items_to_be_public = false
  min_tls_version          = "TLS1_2"
  public_network_access_enabled = false
  network_rules {
    default_action = "Deny"
    bypass         = ["AzureServices"]
    ip_rules       = []
  }
  tags = local.tags
}

resource "azurerm_storage_table" "certs" {
  name                 = "certs"
  storage_account_name = azurerm_storage_account.sa.name
}
resource "azurerm_storage_table" "revocations" {
  name                 = "revocations"
  storage_account_name = azurerm_storage_account.sa.name
}
resource "azurerm_storage_table" "rootcas" {
  name                 = "rootcas"
  storage_account_name = azurerm_storage_account.sa.name
}
resource "azurerm_storage_table" "auditlog" {
  name                 = "auditlog"
  storage_account_name = azurerm_storage_account.sa.name
}
resource "azurerm_storage_container" "exports" {
  name                  = "exports"
  storage_account_id    = azurerm_storage_account.sa.id
  container_access_type = "private"
}

# Role assignments for workload identity (ACR pull & Storage data access)
resource "azurerm_role_assignment" "acr_pull" {
  scope                = azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.workload.principal_id
}

resource "azurerm_role_assignment" "storage_table_contrib" {
  scope                = azurerm_storage_account.sa.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = azurerm_user_assigned_identity.workload.principal_id
}

resource "azurerm_role_assignment" "storage_blob_contrib" {
  scope                = azurerm_storage_account.sa.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.workload.principal_id
}

# Private DNS zones for storage already defined above if absent

