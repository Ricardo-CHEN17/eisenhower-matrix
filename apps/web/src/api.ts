import type {
  Settings,
  Tag,
  Task,
  TaskStatus,
  TaskView
} from "@eisenhower/shared";
import { localApi } from "./local-api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new ApiError(
      payload?.error?.message ?? `Request failed with status ${response.status}`,
      response.status
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface CreateTaskInput {
  title: string;
  notes?: string;
  importance?: number;
  urgency?: number;
  dueDate?: string | null;
  tagIds?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  importance?: number;
  urgency?: number;
  dueDate?: string | null;
  tagIds?: string[];
  status?: TaskStatus;
  archived?: boolean;
}

export interface ApiClient {
  listTasks(view: TaskView): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
  deleteTask(id: string): Promise<{ ok: true }>;
  listTags(): Promise<Tag[]>;
  createTag(name: string): Promise<Tag>;
  deleteTag(id: string): Promise<{ ok: true }>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
}

const httpApi: ApiClient = {
  listTasks(view: TaskView): Promise<Task[]> {
    return request<Task[]>(`/api/tasks?view=${view}`);
  },

  createTask(input: CreateTaskInput): Promise<Task> {
    return request<Task>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
    return request<Task>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },

  deleteTask(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" });
  },

  listTags(): Promise<Tag[]> {
    return request<Tag[]>("/api/tags");
  },

  createTag(name: string): Promise<Tag> {
    return request<Tag>("/api/tags", {
      method: "POST",
      body: JSON.stringify({ name })
    });
  },

  deleteTag(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/api/tags/${id}`, { method: "DELETE" });
  },

  getSettings(): Promise<Settings> {
    return request<Settings>("/api/settings");
  },

  updateSettings(patch: Partial<Settings>): Promise<Settings> {
    return request<Settings>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
  }
};

const useLocalData = import.meta.env.VITE_DATA_MODE === "local";

export const api: ApiClient = useLocalData ? localApi : httpApi;
