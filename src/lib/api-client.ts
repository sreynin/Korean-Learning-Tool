import type { ApiErrorCode, ApiResponse, FieldIssue } from "@/types/api";
import type { Lesson, LessonGenerationRequest } from "@/types/lesson";
import type { Scene } from "@/types/scene";
import type {
  CreateProjectInput,
  ProjectListFilters,
  ProjectStats,
  UpdateProjectInput,
  VideoProject,
} from "@/types/project";

/**
 * Typed client for the /api routes. Used by client components for mutations
 * and interactive reads; server components call the service layer directly.
 */

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly issues: FieldIssue[];

  constructor(
    message: string,
    options: { code: ApiErrorCode; status: number; issues?: FieldIssue[] },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = options.code;
    this.status = options.status;
    this.issues = options.issues ?? [];
  }

  /** Field-keyed messages, ready to drop into form state. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      this.issues.map((issue) => [issue.field, issue.message]),
    );
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiClientError(
      "Could not reach the server. Check your connection and try again.",
      { code: "internal_error", status: 0 },
    );
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError("The server returned an unreadable response.", {
      code: "internal_error",
      status: response.status,
    });
  }

  if (!payload.ok) {
    throw new ApiClientError(payload.error.message, {
      code: payload.error.code,
      status: response.status,
      issues: payload.error.issues,
    });
  }

  return payload.data;
}

function toQueryString(filters: ProjectListFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.format) params.set("format", filters.format);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const api = {
  projects: {
    list: (filters: ProjectListFilters = {}) =>
      request<VideoProject[]>(`/projects${toQueryString(filters)}`),

    get: (id: string) => request<VideoProject>(`/projects/${id}`),

    create: (input: CreateProjectInput) =>
      request<VideoProject>("/projects", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    update: (id: string, input: UpdateProjectInput) =>
      request<VideoProject>(`/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),

    remove: (id: string) =>
      request<{ id: string; deleted: boolean }>(`/projects/${id}`, {
        method: "DELETE",
      }),
  },

  lessons: {
    /** Stateless generation — returns a lesson without saving it. */
    generate: (input: LessonGenerationRequest) =>
      request<{ lesson: Lesson; model: string }>("/lessons/generate", {
        method: "POST",
        body: JSON.stringify(input),
      }),

    /** Generates from the project's own configuration and saves the result. */
    generateForProject: (projectId: string) =>
      request<VideoProject>(`/projects/${projectId}/lesson`, { method: "POST" }),

    save: (projectId: string, lesson: Lesson) =>
      request<VideoProject>(`/projects/${projectId}/lesson`, {
        method: "PUT",
        body: JSON.stringify(lesson),
      }),
  },

  scenes: {
    /** Builds a storyboard from the project's saved lesson and saves it. */
    generateForProject: (projectId: string) =>
      request<VideoProject>(`/projects/${projectId}/scenes`, { method: "POST" }),

    save: (projectId: string, scenes: Scene[]) =>
      request<VideoProject>(`/projects/${projectId}/scenes`, {
        method: "PUT",
        body: JSON.stringify({ scenes }),
      }),
  },

  stats: {
    get: () => request<ProjectStats>("/stats"),
  },
};
