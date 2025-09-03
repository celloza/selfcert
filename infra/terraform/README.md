# Terraform Infrastructure

Provisioned components:
- Resource Group, VNet, and three subnets (App Gateway, ACI workload, PrivateLink)
- User-assigned managed identity (workload) used by the container group
- Azure Container Registry (ACR) with AcrPull role assigned to the identity
- Azure Key Vault (private endpoint + DNS) for root/private key storage (secrets)
- Azure Storage Account (private endpoints for blob & table) used for certificate, revocation, root CA, and audit tables plus an exports container
- Tables: certs, revocations, rootcas, auditlog
- Application Gateway (WAF_v2) public entrypoint (HTTP 80 currently) routing to container group
- Container Group (ACI) hosting two containers: api (8080) and web (80) on an internal IP in the ACI subnet
- Private DNS zones for vaultcore, blob, and table ensuring private endpoint name resolution
- Role assignments granting the workload identity: AcrPull, Storage Table Data Contributor, Storage Blob Data Contributor

Notes / Gaps:
- Terraform state backend not defined here—ensure remote backend configured before team use.

Outputs now include: ACR login server, Key Vault URI, App Gateway public IP, container group private IP, workload identity principal id, storage account name, and private endpoint IPs.

Next enhancements (suggested):
1. Add path-based routing & HTTPS to Application Gateway.
2. Add diagnostic settings (Log Analytics) for Key Vault, Storage, ACR, App Gateway.
3. Introduce variable-driven tuning (CPU/memory, image tags, enable/disable App Gateway) and module refactor if scaling.
4. Add role assignments for Key Vault via RBAC if shifting away from access policies.
5. Add private endpoints for any additional services (e.g., Azure Monitor workspace) when diagnostics enabled.

Apply:
```
terraform init
terraform plan -var "name_prefix=xyz" -var "admin_group_name=YourAADGroup" -out plan.tfplan
terraform apply plan.tfplan
```

Destroy:
```
terraform destroy -var "name_prefix=xyz" -var "admin_group_name=YourAADGroup"
```

Ensure images selfcert-api:latest and selfcert-web:latest are pushed to ACR before deployment (or parameterize tags).
