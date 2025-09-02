import { TableClient, AzureSASCredential } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';

export function getTableClient(tableName: string) {
  const account = process.env.STORAGE_ACCOUNT_NAME;
  if (!account) throw new Error('STORAGE_ACCOUNT_NAME not set');
  const endpoint = `https://${account}.table.core.windows.net`;
  if (process.env.AZURE_TABLES_SAS) {
    return new TableClient(endpoint, tableName, new AzureSASCredential(process.env.AZURE_TABLES_SAS));
  }
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return TableClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING, tableName);
  }
  return new TableClient(endpoint, tableName, new DefaultAzureCredential());
}

export interface TableEntityBase {
  partitionKey: string;
  rowKey: string;
  [key: string]: any;
}
