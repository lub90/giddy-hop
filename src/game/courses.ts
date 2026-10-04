import { parseCourse, type CourseInfo } from './courseFormat';

// Every courses/*.yaml file is bundled into the game as text.
const files = import.meta.glob('../../courses/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

const idOf = (path: string) => path.split('/').pop()!.replace(/\.yaml$/, '');

/**
 * Parses the given course files. Broken files are reported and skipped so one
 * typo does not break the whole game.
 */
export function loadCourses(sources: Record<string, string> = files, onError = console.error): CourseInfo[] {
  const courses: CourseInfo[] = [];
  for (const [path, text] of Object.entries(sources)) {
    try {
      courses.push(parseCourse(idOf(path), text));
    } catch (err) {
      onError(err);
    }
  }
  return courses.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** All valid courses, sorted for the course selection. */
export const COURSES: readonly CourseInfo[] = loadCourses();
