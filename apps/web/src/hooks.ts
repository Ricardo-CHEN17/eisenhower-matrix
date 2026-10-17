import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type Tag,
  type Task,
  type TaskView
} from "@eisenhower/shared";
import { api, type CreateTaskInput, type UpdateTaskInput } from "./api";

export const taskKeys = {
  all: ["tasks"] as const,
  view: (view: TaskView) => ["tasks", view] as const
};

export const tagKeys = {
  all: ["tags"] as const
};

export const settingsKey = ["settings"] as const;

function applyTaskPatch(task: Task, patch: UpdateTaskInput, tags: Tag[]): Task {
  const next: Task = { ...task, tags: [...task.tags] };

  if (patch.title !== undefined) next.title = patch.title;
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.importance !== undefined) next.importance = patch.importance;
  if (patch.urgency !== undefined) next.urgency = patch.urgency;
  if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;

  if (patch.tagIds !== undefined) {
    next.tags = patch.tagIds
      .map((tagId) => tags.find((tag) => tag.id === tagId))
      .filter((tag): tag is Tag => Boolean(tag));
  }

  if (patch.status !== undefined) {
    next.status = patch.status;
    next.completedAt =
      patch.status === "completed"
        ? task.completedAt ?? new Date().toISOString()
        : null;
  }

  if (patch.archived !== undefined) {
    next.archivedAt = patch.archived
      ? task.archivedAt ?? new Date().toISOString()
      : null;
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

export function useTasks(view: TaskView) {
  return useQuery({
    queryKey: taskKeys.view(view),
    queryFn: () => api.listTasks(view)
  });
}

export function useTags() {
  return useQuery({
    queryKey: tagKeys.all,
    queryFn: api.listTags
  });
}

export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: api.getSettings,
    placeholderData: DEFAULT_SETTINGS
  });
}

export function useTaskPreview() {
  const queryClient = useQueryClient();

  return (id: string, patch: UpdateTaskInput) => {
    const tags = queryClient.getQueryData<Tag[]>(tagKeys.all) ?? [];
    queryClient.setQueriesData<Task[]>({ queryKey: taskKeys.all }, (old) =>
      old?.map((task) =>
        task.id === id ? applyTaskPatch(task, patch, tags) : task
      )
    );
  };
}

export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTaskInput }) =>
      api.updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      const previous = queryClient.getQueriesData<Task[]>({
        queryKey: taskKeys.all
      });
      const tags = queryClient.getQueryData<Tag[]>(tagKeys.all) ?? [];

      queryClient.setQueriesData<Task[]>({ queryKey: taskKeys.all }, (old) =>
        old?.map((task) =>
          task.id === id ? applyTaskPatch(task, patch, tags) : task
        )
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([key, data]) => {
        queryClient.setQueryData(key, data);
      });
    },
    onSuccess: (task, variables) => {
      queryClient.setQueriesData<Task[]>({ queryKey: taskKeys.all }, (old) =>
        old?.map((item) => (item.id === task.id ? task : item))
      );

      if (
        variables.patch.status !== undefined ||
        variables.patch.archived !== undefined ||
        variables.patch.tagIds !== undefined
      ) {
        void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      }
    }
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => api.createTask(input),
    onSuccess: (task) => {
      queryClient.setQueryData<Task[]>(taskKeys.view("active"), (old) =>
        old ? [task, ...old] : [task]
      );
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    }
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    }
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => api.createTag(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
    }
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tagKeys.all });
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
    }
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.updateSettings(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const previous = queryClient.getQueryData<Settings>(settingsKey);
      if (previous) {
        queryClient.setQueryData<Settings>(settingsKey, { ...previous, ...patch });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(settingsKey, context.previous);
      }
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKey, settings);
    }
  });
}
