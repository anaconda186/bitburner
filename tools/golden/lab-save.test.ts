import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { editLabSave, editLabSaveText, LAB_HOME_RAM } from "./lab-save.ts";

// The shape of a v3.0.1 save, cut down to the fields the edit touches.
const save = (programs: string[]) =>
  JSON.stringify({
    ctor: "BitburnerSaveObject",
    data: {
      PlayerSave: JSON.stringify({ ctor: "PlayerObject", data: { bitNodeN: 1, sourceFiles: { ctor: "JSONMap", data: [] } } }),
      AllServersSave: JSON.stringify({ home: { ctor: "Server", data: { programs, maxRam: 8 } } }),
      SettingsSave: "{}",
    },
  });
const fields = (text: string) => {
  const s = JSON.parse(text) as { data: Record<string, string> };
  return { player: JSON.parse(s.data.PlayerSave!).data, home: JSON.parse(s.data.AllServersSave!).home.data, s };
};

describe("lab save edit", () => {
  const setup = { bitNodeN: 12, sourceFiles: [[5, 1], [12, 29]] as [number, number][] };

  it("adds Formulas.exe and the RAM, and sets the BitNode and Source-Files", () => {
    const { player, home, s } = fields(editLabSaveText(save(["NUKE.exe"]), setup));
    expect(home.programs).toEqual(["NUKE.exe", "Formulas.exe"]);
    expect(home.maxRam).toBe(LAB_HOME_RAM);
    expect(player.bitNodeN).toBe(12);
    expect(player.sourceFiles).toEqual({ ctor: "JSONMap", data: [[5, 1], [12, 29]] });
    expect(s.data.SettingsSave).toBe("{}");
  });

  it("does not add Formulas.exe twice", () => {
    expect(fields(editLabSaveText(save(["Formulas.exe"]), setup)).home.programs).toEqual(["Formulas.exe"]);
  });

  it("works on the gzip bytes IndexedDB holds", () => {
    const out = editLabSave(new Uint8Array(gzipSync(save([]))), setup);
    expect(fields(gunzipSync(out).toString("utf8")).home.programs).toEqual(["Formulas.exe"]);
  });

  it("refuses something that isn't a save", () => {
    expect(() => editLabSaveText(JSON.stringify({ ctor: "Nope", data: {} }), setup)).toThrow(/not a save/);
  });
});
