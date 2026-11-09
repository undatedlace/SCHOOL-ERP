import ngsw from '../../ngsw-config.json';

describe('service worker config', () => {
  it('never caches data from the API: no data groups, and API paths are not served the app page', () => {
    expect('dataGroups' in ngsw).toBe(false);
    expect(ngsw.navigationUrls).toContain('!/api/**');
    for (const g of ngsw.assetGroups) {
      expect(JSON.stringify(g.resources)).not.toContain('/api');
    }
  });
});
