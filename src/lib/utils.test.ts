import { cn } from "./utils";

describe("cn utility", () => {
  it("returns an empty string when called with no arguments", () => {
    expect(cn()).toBe("");
  });

  it("returns a single class name unchanged", () => {
    expect(cn("px-4")).toBe("px-4");
  });

  it("merges multiple class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("handles conditional classes via clsx syntax", () => {
    const isHidden = false;
    expect(cn("base", isHidden && "hidden", "visible")).toBe("base visible");
  });

  it("resolves Tailwind conflicts with last-wins semantics", () => {
    expect(cn("px-4", "px-2")).toBe("px-2");
  });

  it("handles undefined and null inputs gracefully", () => {
    expect(cn("px-4", undefined, null, "py-2")).toBe("px-4 py-2");
  });

  it("merges conflicting Tailwind color utilities", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles object inputs via clsx", () => {
    expect(cn({ "px-4": true, "py-2": false, "mt-2": true })).toBe(
      "px-4 mt-2"
    );
  });
});
