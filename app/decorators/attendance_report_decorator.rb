class AttendanceReportDecorator < Draper::Decorator
  delegate_all

  # Define presentation-specific methods here. Helpers are accessed through
  # `helpers` (aka `h`). You can override attributes, for example:
  #
  #   def created_at
  #     helpers.content_tag :span, class: 'time' do
  #       object.created_at.strftime("%a %m/%d/%y")
  #     end
  #   end

  def readable_event_type
    object.event_type.humanize.titleize
  end

  def readable_date
    object.date.strftime("%B %d, %Y")
  end
end
