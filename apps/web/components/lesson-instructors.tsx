import type { ClassInstructor, InstructorSummary } from "../lib/api-types";
import { StudioPhoto } from "./studio-photo";

export function SessionInstructor({ instructor }: { instructor: InstructorSummary }) {
  return <figure className="session-instructor">
    <StudioPhoto image={instructor.portrait} priority />
    <figcaption><span className="eyebrow">Lekci vede</span><strong>{instructor.displayName}</strong></figcaption>
  </figure>;
}

export function LessonInstructors({ instructors }: { instructors: ClassInstructor[] }) {
  if (!instructors.length) return null;
  return <section className="lesson-instructors" aria-labelledby="lesson-instructors-title">
    <h2 id="lesson-instructors-title">{instructors.length === 1 ? "Lekci vede" : "Lekci vedou"}</h2>
    <div className="instructor-grid">{instructors.map((person) => <article className="instructor-card" key={person.id}>
      <StudioPhoto image={person.portrait} />
      <div><h3>{person.displayName}</h3>{person.scheduleNote && <p className="instructor-schedule-note">{person.scheduleNote}</p>}{person.bio && <p>{person.bio}</p>}</div>
    </article>)}</div>
  </section>;
}
