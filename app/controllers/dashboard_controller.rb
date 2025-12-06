class DashboardController < ApplicationController
  def index
    @member_count = Member.count
    @group_member_count = GroupMember.pluck(:member_id).uniq.count
    @team_member_count = TeamMember.pluck(:member_id).uniq.count
  end
end
