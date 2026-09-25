jest.mock("./supabase", () => ({ supabase: {} }));
jest.mock("./analytics", () => ({ track: jest.fn() }));

import { gameShareText } from "./share";

const base = { id: "g1", venue: "Alpha Auburn", date: "Thu", time: "7pm" };

describe("gameShareText", () => {
  it("says how many, the level and that the court's booked", () => {
    expect(gameShareText("badminton", { ...base, openSpots: 2, tierLabel: "Intermediate", courtBooked: true })).toBe(
      "Need 2 for badminton at Alpha Auburn, Thu 7pm. Intermediate, court's booked."
    );
  });

  it("derives open spots from a full game row", () => {
    expect(
      gameShareText("badminton", { ...base, maxPlayers: 4, joinedCount: 2, reservedSpots: 0, reservedClaimed: 0, skill: "Beginner", verified: false })
    ).toBe("Need 1 for badminton at Alpha Auburn, Thu 7pm. Beginner.");
  });

  it("falls back to the plain invite when full or unknown", () => {
    expect(gameShareText("badminton", base)).toBe("Come play badminton at Alpha Auburn, Thu 7pm.");
    expect(gameShareText("badminton", { ...base, openSpots: 0 })).toBe("Come play badminton at Alpha Auburn, Thu 7pm.");
  });

  it("never uses an em dash", () => {
    expect(gameShareText("badminton", { ...base, openSpots: 1, tierLabel: "Pro", courtBooked: true })).not.toMatch(/—/);
  });
});
