class MemberDecorator < Draper::Decorator
  delegate_all

  # Define presentation-specific methods here. Helpers are accessed through
  # `helpers` (aka `h`). You can override attributes, for example:
  #
  #   def created_at
  #     helpers.content_tag :span, class: 'time' do
  #       object.created_at.strftime("%a %m/%d/%y")
  #     end
  #   end

  def full_name
    "#{object.first_name} #{object.last_name}"
  end

  def teams_list
    if object.teams.empty?
      "No Teams"
    else
      object.teams.count == 1 ? object.teams.first.name : "#{object.teams.first.name} + #{(object.teams.count -1)} more"
    end
  end 

  def group_name
    if object.groups.empty?
      "No Groups"
    else
      object.groups.first.name
    end
  end
end
