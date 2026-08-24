-- Allow recipients to delete their own notifications
-- (per-item dismiss and "clear all" in the bell dropdown).

create policy notifications_own_delete on public.notifications for delete
  using (recipient_user_id = auth.uid());
