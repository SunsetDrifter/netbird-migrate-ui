import { describe, expect, it } from "vitest";
import { IdMapping } from "./id-mapping";

describe("IdMapping", () => {
  describe("groups", () => {
    it("returns undefined for unknown source IDs", () => {
      const m = new IdMapping();
      expect(m.mapGroupId("unknown")).toBeUndefined();
      expect(m.hasGroup("unknown")).toBe(false);
    });

    it("returns the destination ID after addGroup", () => {
      const m = new IdMapping();
      m.addGroup("src-1", "dest-1");
      expect(m.mapGroupId("src-1")).toBe("dest-1");
      expect(m.hasGroup("src-1")).toBe(true);
    });

    it("mapGroupIds drops unmapped IDs silently", () => {
      const m = new IdMapping();
      m.addGroup("src-1", "dest-1");
      m.addGroup("src-2", "dest-2");

      const mapped = m.mapGroupIds(["src-1", "missing", "src-2"]);

      expect(mapped).toEqual(["dest-1", "dest-2"]);
    });

    it("mapGroupIds does not mutate the input array", () => {
      const m = new IdMapping();
      m.addGroup("a", "x");
      const input = ["a", "b"];

      m.mapGroupIds(input);

      expect(input).toEqual(["a", "b"]);
    });

    it("last write wins for the same source ID", () => {
      const m = new IdMapping();
      m.addGroup("src-1", "dest-A");
      m.addGroup("src-1", "dest-B");
      expect(m.mapGroupId("src-1")).toBe("dest-B");
    });
  });

  describe("posture checks", () => {
    it("tracks posture check IDs separately from group IDs", () => {
      const m = new IdMapping();
      m.addGroup("shared-id", "grp-dest");
      m.addPostureCheck("shared-id", "pc-dest");

      expect(m.mapGroupId("shared-id")).toBe("grp-dest");
      expect(m.mapPostureCheckId("shared-id")).toBe("pc-dest");
    });

    it("mapPostureCheckIds drops unmapped IDs", () => {
      const m = new IdMapping();
      m.addPostureCheck("p1", "dest-p1");
      expect(m.mapPostureCheckIds(["p1", "missing"])).toEqual(["dest-p1"]);
    });
  });
});
