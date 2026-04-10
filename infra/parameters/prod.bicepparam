using '../main.bicep'

param environmentName = 'prod'
param location = 'westeurope'
param namePrefix = 'alfrace'

param cosmosDatabaseName = 'alfabetsrace'
param cosmosContainerName = 'highscores'
param cosmosPartitionKeyPath = '/normalizedUsername'

param webPubSubHubName = 'highscores'
param webPubSubSkuName = 'Free_F1'
param staticWebAppSku = 'Free'

param tags = {
  app: 'alfabetsrace'
  env: 'prod'
  managedBy: 'bicep'
  'Creation date': '2026-04-10'
  'Keep until': '2027-04-10'
  'Responsible email': 'erik.rundberg@omegapoint.se'
}
