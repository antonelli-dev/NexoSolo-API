/**
 * ProjectStatus Enum — canonical list of project pipeline stages + archived.
 * Must match app `projects.status.*` i18n keys.
 */
export enum ProjectStatus {
  BRIEF = 'brief',
  DESIGN = 'design',
  REVIEW = 'review',
  DELIVERY = 'delivery',
  PAID = 'paid',
  ARCHIVED = 'archived',
}

/**
 * Array of all project statuses for iteration/validation.
 */
export const FREELANCE_PROJECT_STATUSES = Object.values(ProjectStatus) as readonly ProjectStatus[];

/**
 * Type alias for union of project status values.
 */
export type FreelanceProjectStatus = ProjectStatus;
