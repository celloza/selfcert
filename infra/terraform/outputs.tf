output "acr_login_server" {
  value = azurerm_container_registry.acr.login_server
}

output "key_vault_uri" {
  value = azurerm_key_vault.kv.vault_uri
}

output "app_gateway_public_ip" {
  value = azurerm_public_ip.appgw.ip_address
}

output "container_group_private_ip" {
  value = azurerm_container_group.app.ip_address
}

output "workload_identity_principal_id" {
  value = azurerm_user_assigned_identity.workload.principal_id
}

output "storage_account_name" {
  value = azurerm_storage_account.sa.name
}

output "private_endpoint_blob_ip" {
  value = azurerm_private_endpoint.sa_blob.private_service_connection[0].private_ip_address
}

output "private_endpoint_table_ip" {
  value = azurerm_private_endpoint.sa_table.private_service_connection[0].private_ip_address
}
