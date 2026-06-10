import { describe, it, expect } from "vitest";

import { appVersion, formatAppVersion } from "./version";

describe("version de l'application", () => {
  it("expose les constantes injectées au build", () => {
    expect(appVersion.version).toBeTruthy();
    expect(appVersion.commit).toBeTruthy();
    expect(appVersion.buildDate).toBeTruthy();
  });

  it("formate un libellé lisible avec version, commit et date", () => {
    const label = formatAppVersion();
    expect(label).toContain(`v${appVersion.version}`);
    expect(label).toContain(`(${appVersion.commit})`);
    // Date au format fr-FR (jj/mm/aaaa)
    expect(label).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
