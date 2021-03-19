import * as objectHash from 'object-hash';

export function getObjectHash(obj: any): string {
    return objectHash.sha1(obj);
}