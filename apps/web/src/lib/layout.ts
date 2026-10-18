import {
  dueState,
  quadrantOf,
  type KnownQuadrant,
  type Quadrant,
  type Task
} from "@eisenhower/shared";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export type CardTier = "lg" | "md" | "sm";
export type CardKind = "important" | "pending" | "unimportant";

export interface CardLayout {
  task: Task;
  rect: Rect;
  tier: CardTier;
  kind: CardKind;
  quadrant: Quadrant;
  anchor: Point;
}

export interface DotLayout {
  task: Task;
  rect: Rect;
  center: Point;
}

export interface ClusterLayout {
  id: string;
  tasks: Task[];
  center: Point;
  rect: Rect;
  urgent: number;
  overdue: number;
}

export interface LeaderLayout {
  from: Point;
  to: Point;
  quadrant: Quadrant;
}

export interface MatrixCounts {
  1: number;
  2: number;
  3: number;
  4: number;
  pending: number;
}

export interface MatrixLayout {
  cards: CardLayout[];
  dots: DotLayout[];
  clusters: ClusterLayout[];
  leaders: LeaderLayout[];
  counts: MatrixCounts;
}

export interface LayoutInput {
  tasks: Task[];
  threshold: number;
  width: number;
  height: number;
  selectedId: string | null;
  forceIndividual: boolean;
  today?: Date;
}

export interface QuadrantBounds {
  importanceMin: number;
  importanceMax: number;
  urgencyMin: number;
  urgencyMax: number;
}

export interface QuadrantLayoutInput {
  tasks: Task[];
  quadrant: KnownQuadrant;
  threshold: number;
  width: number;
  height: number;
}

const PAD = 14;
const LABEL_BREAKPOINT = 960;
const CARD_GAP = 7;
const MAX_OFFSET = 200;

interface Size {
  width: number;
  height: number;
}

function cardSize(width: number, tier: CardTier): Size {
  if (width < 680) {
    if (tier === "lg") return { width: 156, height: 80 };
    if (tier === "md") return { width: 142, height: 76 };
    return { width: 122, height: 62 };
  }
  if (width < 960) {
    if (tier === "lg") return { width: 178, height: 82 };
    if (tier === "md") return { width: 160, height: 76 };
    return { width: 138, height: 62 };
  }
  if (tier === "lg") return { width: 202, height: 90 };
  if (tier === "md") return { width: 184, height: 82 };
  return { width: 158, height: 66 };
}

function tierFor(task: Task): CardTier {
  if (task.importance >= 80) return "lg";
  if (task.importance >= 60) return "md";
  return "sm";
}

function scoreToPoint(
  task: Pick<Task, "importance" | "urgency">,
  width: number,
  height: number
): Point {
  return {
    x: PAD + (task.urgency / 100) * (width - PAD * 2),
    y: PAD + ((100 - task.importance) / 100) * (height - PAD * 2)
  };
}

function pointToScore(point: Point, width: number, height: number) {
  return {
    urgency: Math.min(
      100,
      Math.max(
        0,
        Math.round(((point.x - PAD) / Math.max(1, width - PAD * 2)) * 100)
      )
    ),
    importance: Math.min(
      100,
      Math.max(
        0,
        Math.round(
          100 - ((point.y - PAD) / Math.max(1, height - PAD * 2)) * 100
        )
      )
    )
  };
}

function rectFromCenter(center: Point, size: Size): Rect {
  const left = center.x - size.width / 2;
  const top = center.y - size.height / 2;
  return {
    left,
    top,
    width: size.width,
    height: size.height,
    right: left + size.width,
    bottom: top + size.height
  };
}

function clampRect(rect: Rect, maxWidth: number, maxHeight: number, margin = 8): Rect {
  const left = Math.min(
    Math.max(rect.left, margin),
    Math.max(margin, maxWidth - rect.width - margin)
  );
  const top = Math.min(
    Math.max(rect.top, margin),
    Math.max(margin, maxHeight - rect.height - margin)
  );
  return {
    left,
    top,
    width: rect.width,
    height: rect.height,
    right: left + rect.width,
    bottom: top + rect.height
  };
}

function overlaps(a: Rect, b: Rect, gap = 6): boolean {
  return !(
    a.right + gap <= b.left ||
    a.left >= b.right + gap ||
    a.bottom + gap <= b.top ||
    a.top >= b.bottom + gap
  );
}

function overlapsAny(rect: Rect, obstacles: Rect[], gap = 6): boolean {
  return obstacles.some((obstacle) => overlaps(rect, obstacle, gap));
}

const OFFSETS: Array<{ dx: number; dy: number }> = (() => {
  const result = [{ dx: 0, dy: 0 }];
  for (let radius = 12; radius <= 200; radius += 12) {
    for (let index = 0; index < 12; index++) {
      const angle = (index / 12) * Math.PI * 2 + (radius / 12) * 0.4;
      result.push({
        dx: Math.cos(angle) * radius,
        dy: Math.sin(angle) * radius
      });
    }
  }
  return result;
})();

function labelWidths(width: number, threshold: number) {
  const max = width < LABEL_BREAKPOINT ? 180 : 250;
  return {
    left: Math.max(150, Math.min(max, (threshold / 100) * width - 24)),
    right: Math.max(150, Math.min(max, ((100 - threshold) / 100) * width - 24))
  };
}

function labelRects(width: number, height: number, threshold: number): Rect[] {
  const widths = labelWidths(width, threshold);
  const labelHeight = width < LABEL_BREAKPOINT ? 42 : 62;
  const topHeight = Math.min(labelHeight, ((100 - threshold) / 100) * height);
  const bottomHeight = Math.min(labelHeight, (threshold / 100) * height);

  return [
    {
      left: 16,
      top: 14,
      width: widths.left,
      height: topHeight,
      right: 16 + widths.left,
      bottom: 14 + topHeight
    },
    {
      left: width - 16 - widths.right,
      top: 14,
      width: widths.right,
      height: topHeight,
      right: width - 16,
      bottom: 14 + topHeight
    },
    {
      left: 16,
      top: height - 14 - bottomHeight,
      width: widths.left,
      height: bottomHeight,
      right: 16 + widths.left,
      bottom: height - 14
    },
    {
      left: width - 16 - widths.right,
      top: height - 14 - bottomHeight,
      width: widths.right,
      height: bottomHeight,
      right: width - 16,
      bottom: height - 14
    }
  ];
}

function quadrantAt(
  point: Point,
  width: number,
  height: number,
  threshold: number
): Quadrant {
  const score = pointToScore(point, width, height);
  return quadrantOf(score, threshold);
}

function findPlacement(
  anchor: Point,
  size: Size,
  obstacles: Rect[],
  width: number,
  height: number,
  strictQuadrant: Quadrant | null,
  threshold: number,
  maxOffset = MAX_OFFSET
): { rect: Rect; offset: number } | null {
  for (const offset of OFFSETS) {
    const distance = Math.hypot(offset.dx, offset.dy);
    if (distance > maxOffset) continue;

    const center = {
      x: anchor.x + offset.dx,
      y: anchor.y + offset.dy
    };
    const rect = clampRect(rectFromCenter(center, size), width, height);

    if (overlapsAny(rect, obstacles, CARD_GAP)) continue;
    if (
      strictQuadrant &&
      quadrantAt(
        {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        },
        width,
        height,
        threshold
      ) !== strictQuadrant
    ) {
      continue;
    }

    return { rect, offset: distance };
  }

  return null;
}

interface ClusterDraft {
  id: string;
  tasks: Task[];
  center: Point;
}

function buildClusters(
  tasks: Task[],
  width: number,
  height: number
): ClusterDraft[] {
  const clusters: ClusterDraft[] = [];
  const sorted = [...tasks].sort(
    (a, b) =>
      b.urgency - a.urgency ||
      b.importance - a.importance ||
      a.id.localeCompare(b.id)
  );

  for (const task of sorted) {
    const point = scoreToPoint(task, width, height);
    let match: ClusterDraft | null = null;
    let best = Infinity;

    for (const cluster of clusters) {
      const distance = Math.hypot(
        point.x - cluster.center.x,
        point.y - cluster.center.y
      );
      if (distance <= 30 && distance < best) {
        best = distance;
        match = cluster;
      }
    }

    if (match) {
      match.tasks.push(task);
      let x = 0;
      let y = 0;
      for (const item of match.tasks) {
        const itemPoint = scoreToPoint(item, width, height);
        x += itemPoint.x;
        y += itemPoint.y;
      }
      match.center = {
        x: x / match.tasks.length,
        y: y / match.tasks.length
      };
    } else {
      clusters.push({ id: task.id, tasks: [task], center: point });
    }
  }

  for (const cluster of clusters) {
    cluster.id = cluster.tasks.map((task) => task.id).sort().join("|");
  }

  return clusters;
}

export function emptyLayout(): MatrixLayout {
  return {
    cards: [],
    dots: [],
    clusters: [],
    leaders: [],
    counts: { 1: 0, 2: 0, 3: 0, 4: 0, pending: 0 }
  };
}

export function layoutMatrix(input: LayoutInput): MatrixLayout {
  const { tasks, threshold, width, height, selectedId, forceIndividual } = input;
  const today = input.today ?? new Date();

  if (width < 40 || height < 40) return emptyLayout();

  const counts: MatrixCounts = { 1: 0, 2: 0, 3: 0, 4: 0, pending: 0 };
  for (const task of tasks) {
    counts[quadrantOf(task, threshold)]++;
  }

  const pendingTasks = tasks.filter(
    (task) => quadrantOf(task, threshold) === "pending"
  );
  const importantTasks = tasks.filter((task) => {
    const quadrant = quadrantOf(task, threshold);
    return quadrant === 1 || quadrant === 2;
  });
  const unimportantAll = tasks.filter((task) => {
    const quadrant = quadrantOf(task, threshold);
    return quadrant === 3 || quadrant === 4;
  });

  const selectedUnimportant =
    !forceIndividual && selectedId
      ? unimportantAll.find((task) => task.id === selectedId) ?? null
      : null;

  const unimportantPool = selectedUnimportant
    ? unimportantAll.filter((task) => task.id !== selectedId)
    : unimportantAll;

  const labelObstacles = labelRects(width, height, threshold);
  const clusterRects: Rect[] = [];
  const dotRects: Rect[] = [];
  const placedCardRects: Rect[] = [];

  const cards: CardLayout[] = [];
  const dots: DotLayout[] = [];
  const clusters: ClusterLayout[] = [];
  const leaders: LeaderLayout[] = [];

  const placeCard = (
    task: Task,
    kind: CardKind,
    quadrant: Quadrant,
    tier: CardTier,
    strictQuadrant: Quadrant | null
  ): CardLayout => {
    const size = cardSize(width, tier);
    const anchor =
      kind === "pending"
        ? scoreToPoint({ importance: threshold, urgency: threshold }, width, height)
        : scoreToPoint(task, width, height);
    const obstacles = [
      ...labelObstacles,
      ...clusterRects,
      ...dotRects,
      ...placedCardRects
    ];

    const strict = findPlacement(
      anchor,
      size,
      obstacles,
      width,
      height,
      strictQuadrant,
      threshold
    );
    const relaxed =
      strict ??
      findPlacement(anchor, size, obstacles, width, height, null, threshold);
    const rect =
      (strict ?? relaxed)?.rect ??
      clampRect(rectFromCenter(anchor, size), width, height);

    placedCardRects.push(rect);

    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    if (Math.hypot(center.x - anchor.x, center.y - anchor.y) > 6) {
      leaders.push({ from: anchor, to: center, quadrant });
    }

    const layout: CardLayout = {
      task,
      rect,
      tier,
      kind,
      quadrant,
      anchor
    };
    cards.push(layout);
    return layout;
  };

  if (!forceIndividual) {
    const clusterDrafts = buildClusters(unimportantPool, width, height);

    for (const draft of clusterDrafts.filter(
      (cluster) => cluster.tasks.length > 1
    )) {
      const size = { width: 64, height: 34 };
      const position =
        findPlacement(
          draft.center,
          size,
          [...labelObstacles, ...clusterRects],
          width,
          height,
          null,
          threshold,
          40
        )?.rect ?? clampRect(rectFromCenter(draft.center, size), width, height);

      clusterRects.push(position);
      clusters.push({
        id: draft.id,
        tasks: draft.tasks,
        center: {
          x: position.left + position.width / 2,
          y: position.top + position.height / 2
        },
        rect: position,
        urgent: draft.tasks.filter((task) => task.urgency >= threshold).length,
        overdue: draft.tasks.filter(
          (task) => dueState(task.dueDate, today) === "overdue"
        ).length
      });
    }

    for (const draft of clusterDrafts.filter(
      (cluster) => cluster.tasks.length === 1
    )) {
      const task = draft.tasks[0]!;
      const anchor = scoreToPoint(task, width, height);
      let center = {
        x: Math.min(Math.max(anchor.x, 12), width - 12),
        y: Math.min(Math.max(anchor.y, 12), height - 12)
      };
      let hitRect = clampRect(
        rectFromCenter(center, { width: 24, height: 24 }),
        width,
        height,
        4
      );

      const tinyObstacles = [...labelObstacles, ...clusterRects, ...dotRects];
      if (overlapsAny(hitRect, tinyObstacles, 3)) {
        for (const offset of OFFSETS.slice(1, 30)) {
          const candidate = clampRect(
            rectFromCenter(
              { x: anchor.x + offset.dx, y: anchor.y + offset.dy },
              { width: 24, height: 24 }
            ),
            width,
            height,
            4
          );
          if (!overlapsAny(candidate, tinyObstacles, 3)) {
            hitRect = candidate;
            center = {
              x: candidate.left + 12,
              y: candidate.top + 12
            };
            break;
          }
        }
      }

      dotRects.push(hitRect);
      dots.push({ task, rect: hitRect, center });
    }

    if (selectedUnimportant) {
      const anchor = scoreToPoint(selectedUnimportant, width, height);
      let center = {
        x: Math.min(Math.max(anchor.x, 12), width - 12),
        y: Math.min(Math.max(anchor.y, 12), height - 12)
      };
      let hitRect = clampRect(
        rectFromCenter(center, { width: 24, height: 24 }),
        width,
        height,
        4
      );
      const tinyObstacles = [...labelObstacles, ...clusterRects, ...dotRects];

      if (overlapsAny(hitRect, tinyObstacles, 3)) {
        for (const offset of OFFSETS.slice(1, 40)) {
          const candidate = clampRect(
            rectFromCenter(
              { x: anchor.x + offset.dx, y: anchor.y + offset.dy },
              { width: 24, height: 24 }
            ),
            width,
            height,
            4
          );
          if (!overlapsAny(candidate, tinyObstacles, 3)) {
            hitRect = candidate;
            center = {
              x: candidate.left + 12,
              y: candidate.top + 12
            };
            break;
          }
        }
      }

      dotRects.push(hitRect);
      dots.push({
        task: selectedUnimportant,
        rect: hitRect,
        center
      });
    }
  }

  for (const task of [...pendingTasks].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  )) {
    placeCard(task, "pending", "pending", "md", null);
  }

  const sortedImportant = [...importantTasks].sort(
    (a, b) =>
      b.importance - a.importance ||
      b.urgency - a.urgency ||
      a.id.localeCompare(b.id)
  );

  for (const task of sortedImportant) {
    const quadrant = quadrantOf(task, threshold);
    placeCard(task, "important", quadrant, tierFor(task), quadrant);
  }

  if (forceIndividual) {
    const sortedUnimportant = [...unimportantAll].sort(
      (a, b) =>
        b.urgency - a.urgency ||
        b.importance - a.importance ||
        a.id.localeCompare(b.id)
    );

    for (const task of sortedUnimportant) {
      const quadrant = quadrantOf(task, threshold);
      placeCard(task, "unimportant", quadrant, "sm", quadrant);
    }
  }

  return { cards, dots, clusters, leaders, counts };
}

export function quadrantBounds(
  quadrant: KnownQuadrant,
  threshold: number
): QuadrantBounds {
  switch (quadrant) {
    case 1:
      return {
        importanceMin: threshold,
        importanceMax: 100,
        urgencyMin: threshold,
        urgencyMax: 100
      };
    case 2:
      return {
        importanceMin: threshold,
        importanceMax: 100,
        urgencyMin: 0,
        urgencyMax: threshold
      };
    case 3:
      return {
        importanceMin: 0,
        importanceMax: threshold,
        urgencyMin: threshold,
        urgencyMax: 100
      };
    case 4:
      return {
        importanceMin: 0,
        importanceMax: threshold,
        urgencyMin: 0,
        urgencyMax: threshold
      };
  }
}

/**
 * Lay out the tasks of a single quadrant across the full canvas, mapping the
 * quadrant's score range onto the available width and height.
 */
export function layoutQuadrant(input: QuadrantLayoutInput): MatrixLayout {
  const { tasks, quadrant, threshold, width, height } = input;
  const counts: MatrixCounts = { 1: 0, 2: 0, 3: 0, 4: 0, pending: 0 };
  counts[quadrant] = tasks.length;

  if (width < 40 || height < 40) {
    return { cards: [], dots: [], clusters: [], leaders: [], counts };
  }

  const bounds = quadrantBounds(quadrant, threshold);
  const importanceSpan = Math.max(
    1,
    bounds.importanceMax - bounds.importanceMin
  );
  const urgencySpan = Math.max(1, bounds.urgencyMax - bounds.urgencyMin);

  const scoreToQuadrantPoint = (
    task: Pick<Task, "importance" | "urgency">
  ): Point => {
    const importanceRatio =
      (task.importance - bounds.importanceMin) / importanceSpan;
    const urgencyRatio = (task.urgency - bounds.urgencyMin) / urgencySpan;
    return {
      x: PAD + urgencyRatio * (width - PAD * 2),
      y: PAD + (1 - importanceRatio) * (height - PAD * 2)
    };
  };

  const sorted = [...tasks].sort(
    (a, b) =>
      b.importance - a.importance ||
      b.urgency - a.urgency ||
      a.id.localeCompare(b.id)
  );

  const placedRects: Rect[] = [];
  const cards: CardLayout[] = [];
  const leaders: LeaderLayout[] = [];

  for (const task of sorted) {
    const tier = tierFor(task);
    const size = cardSize(width, tier);
    const anchor = scoreToQuadrantPoint(task);
    const placement = findPlacement(
      anchor,
      size,
      placedRects,
      width,
      height,
      null,
      threshold
    );
    const rect =
      placement?.rect ??
      clampRect(rectFromCenter(anchor, size), width, height);

    placedRects.push(rect);

    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    if (Math.hypot(center.x - anchor.x, center.y - anchor.y) > 6) {
      leaders.push({ from: anchor, to: center, quadrant });
    }

    cards.push({
      task,
      rect,
      tier,
      kind: quadrant === 1 || quadrant === 2 ? "important" : "unimportant",
      quadrant,
      anchor
    });
  }

  return { cards, dots: [], clusters: [], leaders, counts };
}

