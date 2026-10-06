import test from 'node:test';
import assert from 'node:assert/strict';
import { startStub } from './stub_api.mjs';

test('el servicio de prueba informa el puerto efímero que recibió', async () => {
  const stub = await startStub(0);
  try {
    const address = stub.server.address();
    assert.ok(address && typeof address === 'object');
    assert.equal(new URL(stub.url).port, String(address.port));
    assert.notEqual(address.port, 0);
  } finally {
    await new Promise(resolve => stub.server.close(resolve));
  }
});
