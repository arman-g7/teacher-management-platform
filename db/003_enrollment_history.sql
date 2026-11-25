ALTER TABLE students ADD COLUMN archived_on date;
UPDATE students SET archived_on=(now() AT TIME ZONE 'Asia/Tehran')::date WHERE archived;
ALTER TABLE students ADD CHECK (archived = (archived_on IS NOT NULL));
