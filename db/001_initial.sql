CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), role text NOT NULL CHECK (role IN ('teacher','student')),
 login text NOT NULL UNIQUE, name text NOT NULL, password text NOT NULL,
 active boolean NOT NULL DEFAULT true, must_change boolean NOT NULL DEFAULT false,
 photo uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_teacher ON users(role) WHERE role='teacher';
CREATE TABLE sessions (digest text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE, expires timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE rate_limits (key text PRIMARY KEY, hits integer NOT NULL, until timestamptz NOT NULL);
CREATE TABLE schools (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, address text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', logo uuid, archived boolean NOT NULL DEFAULT false);
CREATE TABLE years (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools, name text NOT NULL, starts date NOT NULL, ends date NOT NULL CHECK(ends>=starts), UNIQUE(school_id,name), UNIQUE(id,school_id));
CREATE TABLE terms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), year_id uuid NOT NULL REFERENCES years, name text NOT NULL, starts date NOT NULL, ends date NOT NULL CHECK(ends>=starts), UNIQUE(year_id,name), UNIQUE(id,year_id));
CREATE TABLE classes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools, year_id uuid NOT NULL, name text NOT NULL, level text NOT NULL, archived boolean NOT NULL DEFAULT false,
 FOREIGN KEY(year_id,school_id) REFERENCES years(id,school_id), UNIQUE(year_id,name), UNIQUE(id,school_id), UNIQUE(id,year_id));
CREATE TABLE subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools, name text NOT NULL, UNIQUE(school_id,name), UNIQUE(id,school_id));
CREATE TABLE students (id uuid PRIMARY KEY REFERENCES users, code text NOT NULL UNIQUE, first_name text NOT NULL, last_name text NOT NULL, contact text NOT NULL DEFAULT '', guardian text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'فعال', archived boolean NOT NULL DEFAULT false);
CREATE TABLE enrollments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students, class_id uuid NOT NULL REFERENCES classes, starts date NOT NULL, ends date CHECK(ends>=starts), UNIQUE(id,class_id,student_id));
CREATE UNIQUE INDEX enrollment_open ON enrollments(student_id) WHERE ends IS NULL;
CREATE INDEX enrollment_class ON enrollments(class_id,starts,ends);
CREATE TABLE attendance_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, class_id uuid NOT NULL, subject_id uuid NOT NULL, day date NOT NULL, slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 20),
 FOREIGN KEY(class_id,school_id) REFERENCES classes(id,school_id), FOREIGN KEY(subject_id,school_id) REFERENCES subjects(id,school_id),
 UNIQUE(class_id,subject_id,day,slot), UNIQUE(id,class_id));
CREATE TABLE attendance (session_id uuid NOT NULL, class_id uuid NOT NULL, student_id uuid NOT NULL, enrollment_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('present','absent','excused','late','early')), note text NOT NULL DEFAULT '',
 PRIMARY KEY(session_id,student_id), FOREIGN KEY(session_id,class_id) REFERENCES attendance_sessions(id,class_id), FOREIGN KEY(enrollment_id,class_id,student_id) REFERENCES enrollments(id,class_id,student_id));
CREATE INDEX attendance_student ON attendance(student_id);
CREATE TABLE events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid REFERENCES schools, class_id uuid, title text NOT NULL, kind text NOT NULL CHECK(kind IN ('lesson','meeting','task','reminder','holiday','exam')), starts timestamptz NOT NULL, ends timestamptz NOT NULL CHECK(ends>starts), color text NOT NULL, reminder integer NOT NULL CHECK(reminder BETWEEN 0 AND 10080), series uuid NOT NULL DEFAULT gen_random_uuid(),
 FOREIGN KEY(class_id,school_id) REFERENCES classes(id,school_id), CHECK(class_id IS NULL OR school_id IS NOT NULL));
CREATE INDEX events_starts ON events(starts);
CREATE TABLE files (id uuid PRIMARY KEY, owner uuid NOT NULL REFERENCES users, pathname text NOT NULL UNIQUE, name text NOT NULL, mime text NOT NULL, bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 3000000), content bytea, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE users ADD FOREIGN KEY(photo) REFERENCES files;
ALTER TABLE schools ADD FOREIGN KEY(logo) REFERENCES files;
CREATE TABLE questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_id uuid NOT NULL REFERENCES subjects, kind text NOT NULL CHECK(kind IN ('single','multi','bool','short','long','blank','number','match','order','file','image')), prompt text NOT NULL, chapter text NOT NULL, difficulty text NOT NULL CHECK(difficulty IN ('easy','medium','hard')), tags text NOT NULL DEFAULT '', definition jsonb NOT NULL, fingerprint text NOT NULL, archived boolean NOT NULL DEFAULT false, UNIQUE(subject_id,fingerprint));
CREATE TABLE exams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL, class_id uuid NOT NULL, subject_id uuid NOT NULL, title text NOT NULL, description text NOT NULL, instructions text NOT NULL,
 starts timestamptz NOT NULL, ends timestamptz NOT NULL CHECK(ends>starts), publish_at timestamptz NOT NULL, minutes int NOT NULL CHECK(minutes BETWEEN 1 AND 480), passing numeric(8,2) NOT NULL CHECK(passing>=0),
 max_attempts int NOT NULL CHECK(max_attempts BETWEEN 1 AND 10), shuffle boolean NOT NULL, shuffle_options boolean NOT NULL, negative boolean NOT NULL, reveal boolean NOT NULL,
 code_hash text, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','archived')), results_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(class_id,school_id) REFERENCES classes(id,school_id), FOREIGN KEY(subject_id,school_id) REFERENCES subjects(id,school_id));
CREATE INDEX exams_class_window ON exams(class_id,starts,ends);
CREATE TABLE exam_targets (exam_id uuid NOT NULL REFERENCES exams, student_id uuid NOT NULL REFERENCES students, PRIMARY KEY(exam_id,student_id));
CREATE TABLE exam_questions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), exam_id uuid NOT NULL REFERENCES exams, position int NOT NULL, kind text NOT NULL, prompt text NOT NULL, definition jsonb NOT NULL, UNIQUE(exam_id,position), UNIQUE(id,exam_id));
CREATE TABLE attempts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), exam_id uuid NOT NULL REFERENCES exams, student_id uuid NOT NULL REFERENCES students, ordinal int NOT NULL, started_at timestamptz NOT NULL, deadline timestamptz NOT NULL, layout jsonb NOT NULL,
 submitted_at timestamptz, finalized boolean NOT NULL DEFAULT false, score numeric(8,2), UNIQUE(exam_id,student_id,ordinal), UNIQUE(id,exam_id));
CREATE UNIQUE INDEX attempt_open ON attempts(exam_id,student_id) WHERE submitted_at IS NULL;
CREATE INDEX attempt_student ON attempts(student_id,exam_id);
CREATE INDEX attempt_deadline ON attempts(deadline) WHERE submitted_at IS NULL;
CREATE TABLE answers (attempt_id uuid NOT NULL, exam_id uuid NOT NULL, question_id uuid NOT NULL, value jsonb NOT NULL DEFAULT 'null', flagged boolean NOT NULL DEFAULT false, revision int NOT NULL DEFAULT 0, points numeric(8,2), feedback text NOT NULL DEFAULT '',
 PRIMARY KEY(attempt_id,question_id), FOREIGN KEY(attempt_id,exam_id) REFERENCES attempts(id,exam_id), FOREIGN KEY(question_id,exam_id) REFERENCES exam_questions(id,exam_id));
CREATE TABLE assessments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), class_id uuid NOT NULL, school_id uuid NOT NULL, year_id uuid NOT NULL, term_id uuid NOT NULL, subject_id uuid NOT NULL, title text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('assignment','activity','midterm','final')), maximum numeric(8,2) NOT NULL CHECK(maximum>0), weight numeric(8,2) NOT NULL CHECK(weight>0), day date NOT NULL, published boolean NOT NULL DEFAULT false,
 FOREIGN KEY(class_id,school_id) REFERENCES classes(id,school_id), FOREIGN KEY(class_id,year_id) REFERENCES classes(id,year_id), FOREIGN KEY(term_id,year_id) REFERENCES terms(id,year_id), FOREIGN KEY(subject_id,school_id) REFERENCES subjects(id,school_id), UNIQUE(id,class_id));
CREATE TABLE grades (assessment_id uuid NOT NULL, class_id uuid NOT NULL, student_id uuid NOT NULL, enrollment_id uuid NOT NULL, score numeric(8,2) NOT NULL CHECK(score>=0), feedback text NOT NULL DEFAULT '', PRIMARY KEY(assessment_id,student_id),
 FOREIGN KEY(assessment_id,class_id) REFERENCES assessments(id,class_id), FOREIGN KEY(enrollment_id,class_id,student_id) REFERENCES enrollments(id,class_id,student_id));
CREATE INDEX grades_student ON grades(student_id);
CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users, topic text NOT NULL, title text NOT NULL, path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz, UNIQUE(user_id,topic));
CREATE INDEX notifications_user_time ON notifications(user_id,created_at DESC);
CREATE TABLE settings (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), data jsonb NOT NULL DEFAULT '{}');
INSERT INTO settings DEFAULT VALUES;
CREATE TABLE audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor uuid REFERENCES users, action text NOT NULL, entity text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_entity ON audit(entity,entity_id,at DESC);
