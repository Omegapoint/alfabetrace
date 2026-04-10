targetScope = 'resourceGroup'

@description('Environment name used for naming and tagging.')
@allowed([
  'prod'
])
param environmentName string = 'prod'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Short app prefix used in resource names.')
@minLength(3)
@maxLength(12)
param namePrefix string = 'alfrace'

@description('Cosmos SQL database name used by the app.')
param cosmosDatabaseName string = 'alfabetsrace'

@description('Cosmos SQL container name used by the app.')
param cosmosContainerName string = 'highscores'

@description('Cosmos partition key path expected by the app data model.')
param cosmosPartitionKeyPath string = '/normalizedUsername'

@description('Web PubSub hub name used by the app.')
param webPubSubHubName string = 'highscores'

@description('Static Web App SKU. Free is cheapest and adequate for small events.')
@allowed([
  'Free'
  'Standard'
])
param staticWebAppSku string = 'Free'

@description('Web PubSub SKU name. Use Free_F1 for lowest cost.')
@allowed([
  'Free_F1'
  'Standard_S1'
])
param webPubSubSkuName string = 'Free_F1'

@description('Optional tags for all resources.')
param tags object = {}

var uniqueSuffix = uniqueString(resourceGroup().id)
var cosmosAccountName = take(toLower('${namePrefix}-${environmentName}-cosmos-${uniqueSuffix}'), 44)
var webPubSubName = take(toLower('${namePrefix}-${environmentName}-wps-${uniqueSuffix}'), 63)
var staticWebAppName = take(toLower('${namePrefix}-${environmentName}-swa-${uniqueSuffix}'), 40)

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-08-15' = {
  name: cosmosAccountName
  location: location
  kind: 'GlobalDocumentDB'
  tags: tags
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
    enableAutomaticFailover: false
    enableFreeTier: false
  }
}

resource cosmosSqlDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-08-15' = {
  name: cosmosDatabaseName
  parent: cosmosAccount
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-08-15' = {
  name: cosmosContainerName
  parent: cosmosSqlDatabase
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: [
          cosmosPartitionKeyPath
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

resource webPubSub 'Microsoft.SignalRService/WebPubSub@2024-03-01' = {
  name: webPubSubName
  location: location
  sku: {
    name: webPubSubSkuName
    capacity: 1
  }
  tags: tags
  properties: {
    publicNetworkAccess: 'Enabled'
    disableAadAuth: false
    disableLocalAuth: false
    tls: {
      clientCertEnabled: false
    }
  }
}

resource webPubSubHub 'Microsoft.SignalRService/WebPubSub/hubs@2024-03-01' = {
  name: webPubSubHubName
  parent: webPubSub
  properties: {
    eventHandlers: []
    anonymousConnectPolicy: 'deny'
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2024-04-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: staticWebAppSku
    tier: staticWebAppSku
  }
  tags: tags
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
    provider: 'GitHub'
  }
}

output cosmosAccountName string = cosmosAccount.name
output cosmosAccountEndpoint string = cosmosAccount.properties.documentEndpoint
output cosmosDatabaseOut string = cosmosDatabaseName
output cosmosContainerOut string = cosmosContainerName

output webPubSubNameOut string = webPubSub.name
output webPubSubHubOut string = webPubSubHub.name
output webPubSubHostName string = webPubSub.properties.hostName

output staticWebAppNameOut string = staticWebApp.name
output staticWebAppDefaultHostName string = staticWebApp.properties.defaultHostname
