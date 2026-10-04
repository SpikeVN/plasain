import { describe, expect, test } from "vitest";
import { dishImageSource } from "./api";

describe("dish image source", () => {
  test("loads bundled catalog art from the Pages origin", () => {
    expect(dishImageSource("/dish-assets/truanayangi-000.webp")).toBe(
      "/dish-assets/truanayangi-000.webp",
    );
  });

  test("keeps user uploads on the API origin", () => {
    expect(dishImageSource("/uploads/dishes/user-image.jpg")).toMatch(
      /\/uploads\/dishes\/user-image\.jpg$/,
    );
    expect(dishImageSource("/uploads/dishes/user-image.jpg")).not.toBe(
      "/uploads/dishes/user-image.jpg",
    );
  });
});
