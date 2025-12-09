class DashboardController < ApplicationController
  def index
    @member_count = Member.count
    @group_member_count = GroupMember.pluck(:member_id).uniq.count
    @team_member_count = TeamMember.pluck(:member_id).uniq.count
    @members_without_group = Member.left_joins(:group_members).where(group_members: { id: nil }).map(&:full_name).join(", ")
    @members_without_team = Member.left_joins(:team_members).where(team_members: { id: nil }).map(&:full_name).join(", ")
  end
end
