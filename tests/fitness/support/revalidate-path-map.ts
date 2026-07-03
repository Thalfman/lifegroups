// Expected revalidate-path set per write action (issue #824).
//
// This map is the reviewable source of truth the fitness check
// (`tests/fitness/write-action-revalidate-paths.test.ts`) pins each action's
// DECLARED revalidate paths against. Any change to an action's revalidate set
// — adding a path, dropping one, changing a wildcard target — must land as a
// deliberate diff here, and a new write action cannot ship without an entry.
//
// Update workflow: change the action, run
//   npx vitest run tests/fitness/write-action-revalidate-paths.test.ts
// and the failure message prints the paste-ready replacement line(s) for the
// affected key(s). Review the new set against the surfaces that render the
// action's data before pasting.
//
// Key scheme: the spec `name` for runner actions (`admin.plan.create_prospect`)
// or `file:<relPath>#direct` for hand-rolled `revalidatePath` callers.
// Value normalization: bare string = exact-path revalidate; a `page:`/`layout:`
// prefix = a typed target (`revalidatePath(path, type)`); `${*}` = one runtime
// interpolation segment (e.g. a profile id).

export const EXPECTED_REVALIDATE_PATHS: Readonly<
  Record<string, readonly string[]>
> = {
  "admin.bulk_import_people": [
    "/admin",
    "/admin/settings",
    "/admin/super-admin",
  ],
  "admin.calendar.archive_event": [
    "/admin",
    "/admin/check-ins",
    "/admin/check-ins/${*}",
    "/admin/groups",
    "/admin/groups/${*}/calendar",
    "/admin/planning",
  ],
  "admin.calendar.create_event": [
    "/admin",
    "/admin/check-ins",
    "/admin/check-ins/${*}",
    "/admin/groups",
    "/admin/groups/${*}/calendar",
    "/admin/planning",
  ],
  "admin.calendar.restore_event": [
    "/admin",
    "/admin/check-ins",
    "/admin/check-ins/${*}",
    "/admin/groups",
    "/admin/groups/${*}/calendar",
    "/admin/planning",
  ],
  "admin.calendar.update_event": [
    "/admin",
    "/admin/check-ins",
    "/admin/check-ins/${*}",
    "/admin/groups",
    "/admin/groups/${*}/calendar",
    "/admin/planning",
  ],
  "admin.capacity_board.set_group_target": [
    "/admin",
    "/admin/launch-planning",
    "/admin/multiply",
    "/admin/planning",
  ],
  "admin.care.set_leader_rubric_grade": [
    "/admin/care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.care_note.write": ["/admin/care", "/admin/shepherd-care/${*}"],
  "admin.follow_ups.create": [
    "/admin",
    "/admin/care",
    "/admin/follow-ups",
    "/admin/guests",
    "/leader",
  ],
  "admin.follow_ups.update_status": [
    "/admin",
    "/admin/care",
    "/admin/follow-ups",
    "/admin/guests",
    "/leader",
  ],
  "admin.group_health.recompute_assessment": [
    "/admin",
    "/admin/group-health",
    "/admin/groups/${*}",
  ],
  "admin.group_health.set_ratings": [
    "/admin",
    "/admin/group-health",
    "/admin/groups/${*}",
  ],
  // The `page:` wildcard target is the #810 fix: the grade form is also
  // mounted on the shepherd-care detail page and the payload has no profile
  // id, so the action revalidates every detail page.
  "admin.group_health.set_rubric_grade": [
    "/admin/care",
    "/admin/shepherd-care",
    "page:/admin/shepherd-care/[profileId]",
  ],
  "admin.groups.close": ["/admin/groups", "/admin/groups/${*}"],
  "admin.groups.create": ["/admin/groups"],
  "admin.groups.reopen": ["/admin/groups", "/admin/groups/${*}"],
  "admin.groups.update": ["/admin/groups"],
  "admin.guests.create": ["/admin", "/admin/follow-ups", "/admin/guests"],
  "admin.guests.update_pipeline": [
    "/admin",
    "/admin/follow-ups",
    "/admin/guests",
  ],
  "admin.launch_planning.archive_multiplication_candidate": [
    "/admin",
    "/admin/launch-planning",
    "/admin/multiply",
    "/admin/planning",
  ],
  "admin.launch_planning.archive_scenario": [
    "/admin",
    "/admin/launch-planning",
    "/admin/planning",
  ],
  "admin.launch_planning.create_multiplication_candidate": [
    "/admin",
    "/admin/launch-planning",
    "/admin/multiply",
    "/admin/planning",
  ],
  "admin.launch_planning.create_scenario": [
    "/admin",
    "/admin/launch-planning",
    "/admin/planning",
  ],
  "admin.launch_planning.record_church_attendance": [
    "/admin",
    "/admin/launch-planning",
    "/admin/planning",
  ],
  "admin.launch_planning.set_current_scenario": [
    "/admin",
    "/admin/launch-planning",
    "/admin/planning",
  ],
  "admin.launch_planning.update_assumptions": [
    "/admin",
    "/admin/launch-planning",
    "/admin/planning",
  ],
  "admin.launch_planning.update_multiplication_candidate": [
    "/admin",
    "/admin/launch-planning",
    "/admin/multiply",
    "/admin/planning",
  ],
  "admin.launch_planning.update_scenario": [
    "/admin",
    "/admin/launch-planning",
    "/admin/planning",
  ],
  "admin.leader_pipeline.advance_apprentice_stage": [
    "/admin",
    "/admin/launch-planning",
    "/admin/leader-pipeline",
    "/admin/multiply",
    "/admin/people",
  ],
  "admin.leader_pipeline.archive_apprentice": [
    "/admin",
    "/admin/launch-planning",
    "/admin/leader-pipeline",
    "/admin/multiply",
    "/admin/people",
  ],
  "admin.leader_pipeline.create_apprentice": [
    "/admin",
    "/admin/launch-planning",
    "/admin/leader-pipeline",
    "/admin/multiply",
    "/admin/people",
  ],
  "admin.leader_pipeline.update_apprentice": [
    "/admin",
    "/admin/launch-planning",
    "/admin/leader-pipeline",
    "/admin/multiply",
    "/admin/people",
  ],
  "admin.multiply.set_group_type_in_pipeline": ["/admin/multiply"],
  "admin.note_transparency_grant.set": [
    "/admin/care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.over_shepherd.create": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/over-shepherds",
    "/admin/shepherd-care/over-shepherds/${*}",
  ],
  "admin.over_shepherd.set_active": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/over-shepherds",
    "/admin/shepherd-care/over-shepherds/${*}",
    "page:/admin/shepherd-care/[profileId]",
  ],
  "admin.over_shepherd.update": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/over-shepherds",
    "/admin/shepherd-care/over-shepherds/${*}",
    "page:/admin/shepherd-care/[profileId]",
  ],
  "admin.people.add_person_to_group": ["/admin/groups/${*}", "/admin/people"],
  "admin.people.assign_leader_to_group": [
    "/admin/groups/${*}",
    "/admin/people",
    "/admin/people/profile/${*}",
  ],
  "admin.people.assign_member_to_group": [
    "/admin/groups/${*}",
    "/admin/people",
    "/admin/people/member/${*}",
  ],
  "admin.people.change_leader_role": ["/admin/people"],
  "admin.people.create_leader": ["/admin/people"],
  "admin.people.create_member": ["/admin/people"],
  "admin.people.deactivate_member": ["/admin/people"],
  "admin.people.deactivate_profile": ["/admin/people"],
  "admin.people.end_group_membership": [
    "/admin/groups/${*}",
    "/admin/people",
    "/admin/people/member/${*}",
  ],
  "admin.people.unassign_leader_from_group": [
    "/admin/groups/${*}",
    "/admin/people",
    "/admin/people/profile/${*}",
  ],
  "admin.plan.add_group_type": ["/admin", "/admin/multiply", "/admin/plan"],
  "admin.plan.archive_prospect": ["/admin", "/admin/multiply", "/admin/plan"],
  "admin.plan.create_prospect": ["/admin", "/admin/multiply", "/admin/plan"],
  "admin.plan.set_prospect_next_step": [
    "/admin",
    "/admin/multiply",
    "/admin/plan",
  ],
  "admin.plan.transition_prospect": [
    "/admin",
    "/admin/multiply",
    "/admin/plan",
  ],
  "admin.plan.update_prospect": ["/admin", "/admin/multiply", "/admin/plan"],
  "admin.prayer_request.write": ["/admin/care", "/admin/shepherd-care/${*}"],
  "admin.settings.reset_metric_defaults": [
    "/admin",
    "/admin/group-health",
    "/admin/groups",
    "/admin/settings",
    "/leader",
  ],
  "admin.settings.set_group_type_config": [
    "/admin",
    "/admin/groups",
    "/admin/multiply",
    "/admin/settings",
  ],
  "admin.settings.set_group_types": [
    "/admin",
    "/admin/groups",
    "/admin/multiply",
    "/admin/settings",
  ],
  "admin.settings.set_health_rubric": [
    "/admin",
    "/admin/group-health",
    "/admin/groups",
    "/admin/settings",
    "/leader",
  ],
  "admin.settings.set_readiness_rule": ["/admin/multiply", "/admin/settings"],
  "admin.settings.update_metric_defaults": [
    "/admin",
    "/admin/group-health",
    "/admin/groups",
    "/admin/settings",
    "/leader",
  ],
  "admin.settings.upsert_group_metric_settings": [
    "/admin",
    "/admin/group-health",
    "/admin/groups",
    "/admin/settings",
    "/leader",
  ],
  "admin.shepherd_care.archive_follow_up": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.create_follow_up": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.log_interaction": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.private_note.add_slot": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.private_note.enroll": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.private_note.remove_slot": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.private_note.rotate_recovery": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.update_follow_up": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.update_follow_up_status": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.upsert_private_note": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_care.upsert_profile": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
  ],
  "admin.shepherd_coverage.assign": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
    "/admin/shepherd-care/over-shepherds",
    "/admin/shepherd-care/over-shepherds/${*}",
  ],
  "admin.shepherd_coverage.end": [
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
    "/admin/shepherd-care/over-shepherds",
    "/admin/shepherd-care/over-shepherds/${*}",
  ],
  "admin.super_admin.update_profile_role": ["/admin/super-admin"],
  "file:app/(protected)/admin/super-admin/account-actions.ts#direct": [
    "/admin/super-admin",
  ],
  "file:app/(protected)/admin/super-admin/clean-slate-actions.ts#direct": [
    "/admin",
    "/admin/super-admin",
  ],
  "file:app/(protected)/admin/super-admin/invite-user-actions.ts#direct": [
    "/admin/people",
    "/admin/super-admin",
  ],
  "file:app/(protected)/admin/super-admin/test-accounts-actions.ts#direct": [
    "/admin/super-admin",
  ],
  "file:app/welcome/actions.ts#direct": ["layout:/"],
  "leader.calendar.archive_event": [
    "/leader",
    "/leader/${*}/calendar",
    "/leader/${*}/checkin",
  ],
  "leader.calendar.create_event": [
    "/leader",
    "/leader/${*}/calendar",
    "/leader/${*}/checkin",
  ],
  "leader.calendar.restore_event": [
    "/leader",
    "/leader/${*}/calendar",
    "/leader/${*}/checkin",
  ],
  "leader.calendar.update_event": [
    "/leader",
    "/leader/${*}/calendar",
    "/leader/${*}/checkin",
  ],
  "leader.care_note.write": ["/leader", "/leader/${*}/care"],
  "leader.checkin.quick_did_not_meet": ["/leader"],
  "leader.checkin.submit": ["/leader", "/leader/${*}/checkin"],
  "leader.follow_up.update_status": ["/admin", "/admin/follow-ups", "/leader"],
  "leader.prayer_request.write": ["/leader", "/leader/${*}/care"],
  "over_shepherd.log_broad_note": ["/over-shepherd/${*}"],
  "super_admin.assign_coverage": ["/admin/super-admin"],
  "super_admin.clean_slate_revert": ["/admin", "/admin/super-admin"],
  "super_admin.clean_slate_wipe": ["/admin", "/admin/super-admin"],
  "super_admin.clear_activity_reset": ["/admin", "/admin/super-admin"],
  "super_admin.end_coverage": ["/admin/super-admin"],
  // inline_delete also revalidates a client-derived `path` (usePathname,
  // validated to start with /admin) — only the static "/admin" fallback is
  // statically pinnable.
  "super_admin.inline_delete": ["/admin"],
  "super_admin.launch_prep": ["/admin", "/admin/super-admin"],
  "super_admin.permanent_delete": ["/admin", "/admin/super-admin"],
  "super_admin.reset_activity": ["/admin", "/admin/super-admin"],
  "super_admin.reset_all": [
    "/admin",
    "/admin/group-health",
    "/admin/shepherd-care",
    "/admin/super-admin",
  ],
  "super_admin.reset_attention_revert": [
    "/admin",
    "/admin/group-health",
    "/admin/shepherd-care",
    "/admin/super-admin",
  ],
  "super_admin.reset_audit_logs": ["/admin/super-admin"],
  "super_admin.reset_care_attention": [
    "/admin",
    "/admin/shepherd-care",
    "/admin/shepherd-care/${*}",
    "/admin/super-admin",
  ],
  "super_admin.reset_health_attention": [
    "/admin",
    "/admin/group-health",
    "/admin/super-admin",
  ],
  "super_admin.reset_history_category": ["/admin", "/admin/super-admin"],
  "super_admin.reset_history_category_revert": ["/admin", "/admin/super-admin"],
  "super_admin.restore_tombstone": ["/admin", "/admin/super-admin"],
  "super_admin.set_feature_flag": ["/admin/super-admin"],
  "super_admin.set_platform_config": ["/admin/super-admin"],
  "super_admin.set_profile_status": ["/admin/super-admin"],
};
