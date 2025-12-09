class DashboardController < ApplicationController
  def index
    @total_member_count = Member.count
    @active_member_count = Member.active.count
    @prospective_member_count = Member.prospective.count
    @guest_member_count = Member.guest.count
    @group_member_count = GroupMember.pluck(:member_id).uniq.count
    @team_member_count = TeamMember.pluck(:member_id).uniq.count
    @active_members_without_group = Member.left_joins(:group_members).active.where(group_members: { id: nil }).map(&:full_name).join(", ")
    @active_members_without_team = Member.left_joins(:team_members).active.where(team_members: { id: nil }).map(&:full_name).join(", ")
  end
end
