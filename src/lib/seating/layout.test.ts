import assert from "node:assert/strict";
import { test } from "node:test";
import { seatRuns } from "./layout";

const seat = (number: string, x: number, y = 603, row = "4") => ({ section: "NEF", row, number, x, y });
const numbers = (runs: { number: string }[][]) => runs.map((run) => run.map((s) => s.number));

test("le rang suit le dessin, pas l'ordre du plan, et l'allée coupe le groupe", () => {
  const row = [
    seat("8", 431),
    seat("7", 446),
    seat("6", 460),
    seat("5", 510),
    seat("4", 525),
    seat("3", 539),
    seat("10", 400),
    seat("1", 568),
  ];
  assert.deepEqual(numbers(seatRuns(row)), [["10"], ["8", "7", "6"], ["5", "4", "3"], ["1"]]);
});

test("un rang vertical se lit de haut en bas et chaque rang reste à part", () => {
  const runs = seatRuns([seat("2", 100, 130), seat("1", 100, 115), seat("3", 100, 145), seat("1", 300, 0, "5")]);
  assert.deepEqual(numbers(runs), [["1", "2", "3"], ["1"]]);
});
