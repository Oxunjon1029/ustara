-- Clients (and admins) can have a profile photo too; barbers keep theirs on barbers.photo_path.
alter table profiles add column if not exists photo_path text;
