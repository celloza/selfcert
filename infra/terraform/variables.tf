variable "name_prefix" { type = string }

variable "location" {
  type    = string
  default = "eastus"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "admin_group_name" { type = string }

# Network configuration
variable "vnet_address_space" {
  description = "Address space list for the VNet"
  type        = list(string)
  default     = ["10.42.0.0/16"]
}

variable "subnet_appgw_prefix" {
  description = "CIDR prefix for the Application Gateway subnet"
  type        = string
  default     = "10.42.1.0/24"
}

variable "subnet_aci_prefix" {
  description = "CIDR prefix for the ACI subnet"
  type        = string
  default     = "10.42.2.0/24"
}

variable "subnet_privatelink_prefix" {
  description = "CIDR prefix for the Private Endpoint subnet"
  type        = string
  default     = "10.42.3.0/24"
}

variable "appgw_enable_https" {
  description = "Enable HTTPS listener on Application Gateway"
  type        = bool
  default     = true
}

variable "appgw_cert_pfx_base64" {
  description = "Base64-encoded PFX certificate for Application Gateway (if empty and HTTPS enabled, gateway will deploy without HTTPS until provided)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "appgw_cert_password" {
  description = "Password for the PFX certificate (if provided)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "key_vault_use_rbac" {
  description = "If true, uses RBAC role assignments instead of access policy for Key Vault access."
  type        = bool
  default     = false
}
