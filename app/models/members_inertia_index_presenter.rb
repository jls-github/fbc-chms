class MembersInertiaIndexPresenter
  def initialize(members:)
    @members = members
  end

  def as_json(_options = {})
    @members.map do |member|
      {
        id: member.id,
        name: member.full_name,
        teamsList: member.teams_list,
        groupName: member.group_name,
        status: member.status,
        firstName: member.first_name,
        lastName: member.last_name
      }
    end
  end
end