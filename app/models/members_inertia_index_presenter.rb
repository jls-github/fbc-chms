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
        lastName: member.last_name,
        family: member.family ? member.family.name : nil,
        phone: member.phone,
        email: member.email,
        birthdate: member.birthdate,
        address: member.full_address
      }
    end
  end
end