
CREATE TYPE public.student_gender AS ENUM ('Male', 'Female');
CREATE TYPE public.student_form AS ENUM ('Form 1', 'Form 2', 'Form 3');

ALTER TABLE public.students
  ADD COLUMN gender student_gender,
  ADD COLUMN form student_form;
