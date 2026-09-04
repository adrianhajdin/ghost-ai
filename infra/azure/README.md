# Low-cost Azure deployment

This deployment keeps Trigger.dev and Liveblocks, and hosts the Next.js web app in Azure Container Apps. Azure Container Apps Consumption is a good fit for a low-traffic personal deployment because the app can scale to zero.

## Resources

Create these resources in one region and resource group:

- Azure Container Apps Consumption environment
- Azure Database for PostgreSQL Flexible Server, Burstable B1ms, without high availability
- A standard GPv2 LRS Storage Account only if artifacts are migrated from Vercel Blob
- Azure OpenAI or a Microsoft Foundry resource with a pay-as-you-go serverless model deployment

Do not create AKS, a dedicated Container Apps workload profile, managed GPU hosting, private endpoints, Azure AI Search, or API Management for the initial deployment.

## Build and deploy

Build the standalone image from the repository root and push it to a registry available to Azure Container Apps:

```bash
docker build -t <registry>/<owner>/ghost-ai:latest .
docker push <registry>/<owner>/ghost-ai:latest
```

Deploy the Container Apps environment and web app:

```bash
az login
az account set --subscription <subscription-id>
az group create --name ghost-ai-rg --location eastus

az deployment group create \
  --resource-group ghost-ai-rg \
  --template-file infra/azure/container-app.bicep \
  --parameters appName=ghost-ai image=<registry>/<owner>/ghost-ai:latest
```

The template uses `minReplicas=0`, `maxReplicas=1`, 0.5 vCPU, and 1 GiB memory. Increase these only after measuring real demand.

## Database

Create a small development database without high availability:

```bash
az postgres flexible-server create \
  --resource-group ghost-ai-rg \
  --name <globally-unique-server-name> \
  --location eastus \
  --tier Burstable \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16 \
  --admin-user <admin-user> \
  --admin-password '<strong-password>'
```

Use a connection string with TLS:

```text
postgresql://<admin-user>:<password>@<server>.postgres.database.azure.com:5432/postgres?sslmode=require
```

Run the migrations from a trusted machine:

```bash
DATABASE_URL='postgresql://...' npm run prisma:deploy
```

Stop the Flexible Server outside development hours. Stopped servers do not incur compute charges, but storage and backup charges remain.

## Container secrets

For a small prototype, use Container Apps application secrets and reference them as environment variables. Do not commit values to Bicep or Git:

```bash
az containerapp secret set \
  --name ghost-ai \
  --resource-group ghost-ai-rg \
  --secrets \
    database-url='<DATABASE_URL>' \
    encryption-key='<AI_CONFIG_ENCRYPTION_KEY>' \
    entra-client-secret='<ENTRA_CLIENT_SECRET>' \
    entra-client-id='<ENTRA_CLIENT_ID>' \
    entra-tenant-id='<ENTRA_TENANT_ID>' \
    nextauth-secret='<NEXTAUTH_SECRET>' \
    liveblocks-secret='<LIVEBLOCKS_SECRET_KEY>' \
    trigger-secret='<TRIGGER_SECRET_KEY>' \
    blob-token='<BLOB_READ_WRITE_TOKEN>'

az containerapp update \
  --name ghost-ai \
  --resource-group ghost-ai-rg \
  --set-env-vars \
    DATABASE_URL=secretref:database-url \
    AI_CONFIG_ENCRYPTION_KEY=secretref:encryption-key \
    ENTRA_CLIENT_SECRET=secretref:entra-client-secret \
    ENTRA_CLIENT_ID=secretref:entra-client-id \
    ENTRA_TENANT_ID=secretref:entra-tenant-id \
    NEXTAUTH_SECRET=secretref:nextauth-secret \
    NEXTAUTH_URL='https://<container-app-fqdn>' \
    LIVEBLOCKS_SECRET_KEY=secretref:liveblocks-secret \
    TRIGGER_SECRET_KEY=secretref:trigger-secret \
    BLOB_READ_WRITE_TOKEN=secretref:blob-token
```

For a production deployment, reference secrets from Azure Key Vault with a managed identity instead of passing values directly to the CLI. The same `DATABASE_URL` and `AI_CONFIG_ENCRYPTION_KEY` must also be configured in the Trigger.dev environment.

Register a single-tenant Microsoft Entra web application and add the callback URL:

```text
https://<container-app-fqdn>/api/auth/callback/azure-ad
```

Set `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` from that registration.

## Azure AI provider

Create a pay-as-you-go serverless deployment in Microsoft Foundry or Azure OpenAI. Choose a small model that supports chat completions and tool calling, because the design agent uses tools.

In Ghost AI, open **AI Workspace -> provider settings** and add **Azure OpenAI / Foundry**:

- **Base URL**: `https://<resource>.openai.azure.com/openai/v1`
- **Model ID**: the Azure deployment name, not the base model name
- **API key**: the resource key from Azure

The provider uses Azure's `api-key` authentication and works from both the Azure app and the Trigger.dev worker. Keep the endpoint public for the first low-cost deployment; private networking requires additional network resources and configuration.

## Cost guardrails

- Container Apps Consumption includes monthly free grants and charges no compute at zero replicas.
- Keep PostgreSQL Burstable B1ms, no HA, and stop it when idle.
- Use serverless/pay-as-you-go model inference; do not use PTUs or managed GPU deployments.
- Set Azure Cost Management budgets and alerts. Budgets alert but do not hard-stop model spend.
- Keep Container Apps logs short and low-volume; Log Analytics is billed separately.
