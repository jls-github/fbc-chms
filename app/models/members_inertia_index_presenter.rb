class MembersInertiaIndexPresenter
  def initialize(members:)
    @members = members
  end

  def as_json(_options = {})
    @members.map do |member|
      {
        id: member.id,
        name: member.full_name,
        teams_list: member.teams_list,
        group_name: member.group_name,
        status: member.status,
      }
    end
  end
end