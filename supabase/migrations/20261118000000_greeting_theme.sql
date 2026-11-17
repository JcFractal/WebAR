-- Simple presentation style for a greeting. Additive: older code ignores it and new rows default to plain.
alter table public.greetings add column if not exists theme text not null default 'plain';
alter table public.greetings drop constraint if exists greetings_theme_check;
alter table public.greetings add constraint greetings_theme_check check (theme in ('plain', 'birthday'));
