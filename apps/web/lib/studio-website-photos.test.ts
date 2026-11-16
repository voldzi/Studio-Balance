import { describe, expect, it } from "vitest";
import { moveWebsitePhoto } from "./studio-website-photos";

describe("studio gallery ordering", () => {
  it("moves in both directions without altering visibility or the original order", () => {
    const original = [{ assetId: "a", visible: true }, { assetId: "b", visible: false }, { assetId: "c", visible: true }];
    const moved = moveWebsitePhoto(original, "a", "c");
    expect(moved.map((entry) => entry.assetId)).toEqual(["b", "c", "a"]);
    expect(moved[0]?.visible).toBe(false);
    expect(moveWebsitePhoto(moved, "a", "b")).toEqual(original);
    expect(original.map((entry) => entry.assetId)).toEqual(["a", "b", "c"]);
    expect(moveWebsitePhoto(original, "missing", "a")).toBe(original);
  });
});
