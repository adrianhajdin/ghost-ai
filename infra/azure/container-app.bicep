targetScope = 'resourceGroup'

@description('Globally unique name for the Container App.')
param appName string = 'ghost-ai'

@description('Container image, for example ghcr.io/your-org/ghost-ai:latest.')
param image string

@description('Azure region for the Container Apps environment.')
param location string = resourceGroup().location

@description('Port exposed by the Next.js standalone server.')
param targetPort int = 3000

@description('Keep zero for the lowest idle cost.')
param minReplicas int = 0

@description('Start with one replica for a small personal deployment.')
param maxReplicas int = 1

resource managedEnvironment 'Microsoft.App/managedEnvironments@2025-02-02-preview' = {
  name: '${appName}-env'
  location: location
  properties: {}
}

resource containerApp 'Microsoft.App/containerApps@2025-02-02-preview' = {
  name: appName
  location: location
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: targetPort
        transport: 'auto'
        allowInsecure: false
      }
      activeRevisionsMode: 'Single'
    }
    template: {
      containers: [
        {
          name: 'web'
          image: image
          resources: {
            cpu: 0.5
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'
