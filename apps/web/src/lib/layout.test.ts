import { describe, expect, it } from "vitest";
import type { Task } from "@eisenhower/shared";
import { layoutMatrix, layoutQuadrant } from "./layout";

function task(
  id: string,
  importance: number,
  urgency: number,
  overrides: Partial<Task> = {}
): Task {
  return {
    id,
    title: id,
    notes: "",
    importance,
    urgency,
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    status: "active",
    completedAt: null,
    archivedAt: null,
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    tags: [],
    ...overrides
  };
}

function overlaps(
  a: { rect: { left: number; top: number; width: number; height: number } },
  b: { rect: { left: number; top: number; width: number; height: number } }
): boolean {
  return !(
    a.rect.left + a.rect.width <= b.rect.left ||
    a.rect.left >= b.rect.left + b.rect.width ||
    a.rect.top + a.rect.height <= b.rect.top ||
    a.rect.top >= b.rect.top + b.rect.height
  );
}

describe("layoutMatrix", () => {
  const base = {
    width: 1000,
    height: 700,
    selectedId: null,
    forceIndividual: false,
    threshold: 50
  };

  it("counts quadrants and pending tasks", () => {
    const layout = layoutMatrix({
      ...base,
      tasks: [
        task("q1", 90, 80),
        task("q2", 90, 20),
        task("q3", 20, 80),
        task("q4", 20, 20),
        task("pending", 50, 50)
      ]
    });

    expect(layout.counts).toEqual({
      1: 1,
      2: 1,
      3: 1,
      4: 1,
      pending: 1
    });
    expect(layout.cards.find((card) => card.task.id === "pending")?.kind).toBe(
      "pending"
    );
  });

  it("groups nearby unimportant tasks into a cluster", () => {
    const layout = layoutMatrix({
      ...base,
      tasks: [
        task("u1", 20, 20),
        task("u2", 22, 18),
        task("far", 20, 80)
      ]
    });

    expect(layout.clusters).toHaveLength(1);
    expect(layout.clusters[0]?.tasks.map((item) => item.id).sort()).toEqual([
      "u1",
      "u2"
    ]);
  });

  it("expands unimportant tasks to cards when filtering", () => {
    const layout = layoutMatrix({
      ...base,
      forceIndividual: true,
      tasks: [task("u1", 20, 20), task("u2", 22, 18)]
    });

    expect(layout.clusters).toHaveLength(0);
    expect(layout.dots).toHaveLength(0);
    expect(layout.cards.filter((card) => card.kind === "unimportant")).toHaveLength(
      2
    );
  });

  it("pulls a selected unimportant task out of its cluster", () => {
    const layout = layoutMatrix({
      ...base,
      selectedId: "u1",
      tasks: [task("u1", 20, 20), task("u2", 22, 18)]
    });

    expect(layout.clusters).toHaveLength(0);
    expect(layout.dots.some((dot) => dot.task.id === "u1")).toBe(true);
  });

  it("avoids card overlaps when there is room", () => {
    const layout = layoutMatrix({
      ...base,
      tasks: [
        task("a", 95, 92),
        task("b", 90, 85),
        task("c", 85, 30),
        task("d", 80, 25),
        task("e", 70, 15)
      ]
    });

    for (let i = 0; i < layout.cards.length; i++) {
      for (let j = i + 1; j < layout.cards.length; j++) {
        expect(overlaps(layout.cards[i]!, layout.cards[j]!)).toBe(false);
      }
    }
  });
});

describe("layoutQuadrant", () => {
  const base = {
    width: 900,
    height: 600,
    threshold: 50,
    selectedId: null
  };

  it("renders every task as a card and counts only the focused quadrant", () => {
    const layout = layoutQuadrant({
      ...base,
      quadrant: 1,
      tasks: [task("a", 90, 80), task("b", 60, 55)]
    });

    expect(layout.counts).toEqual({ 1: 2, 2: 0, 3: 0, 4: 0, pending: 0 });
    expect(layout.cards).toHaveLength(2);
    expect(layout.dots).toHaveLength(0);
    expect(layout.clusters).toHaveLength(0);
  });

  it("maps the quadrant score range onto the whole canvas", () => {
    const layout = layoutQuadrant({
      ...base,
      quadrant: 1,
      tasks: [task("low", 50, 50), task("high", 100, 100)]
    });

    const low = layout.cards.find((card) => card.task.id === "low")!;
    const high = layout.cards.find((card) => card.task.id === "high")!;

    expect(low.anchor.x).toBeGreaterThan(0);
    expect(low.anchor.x).toBeLessThan(high.anchor.x);
    expect(low.anchor.y).toBeGreaterThan(high.anchor.y);
    expect(high.anchor.x).toBeLessThan(base.width);
    expect(high.anchor.y).toBeGreaterThan(0);
  });

  it("maps quadrant 4 scores from bottom-left to top-right", () => {
    const layout = layoutQuadrant({
      ...base,
      quadrant: 4,
      tasks: [task("bottom", 0, 0), task("top", 49, 49)]
    });

    const bottom = layout.cards.find((card) => card.task.id === "bottom")!;
    const top = layout.cards.find((card) => card.task.id === "top")!;

    expect(bottom.anchor.x).toBeLessThan(top.anchor.x);
    expect(bottom.anchor.y).toBeGreaterThan(top.anchor.y);
  });

  it("avoids card overlaps when there is room", () => {
    const layout = layoutQuadrant({
      ...base,
      quadrant: 2,
      tasks: [
        task("a", 95, 45),
        task("b", 90, 40),
        task("c", 80, 30),
        task("d", 70, 20),
        task("e", 60, 10)
      ]
    });

    for (let i = 0; i < layout.cards.length; i++) {
      for (let j = i + 1; j < layout.cards.length; j++) {
        expect(overlaps(layout.cards[i]!, layout.cards[j]!)).toBe(false);
      }
    }
  });
});
