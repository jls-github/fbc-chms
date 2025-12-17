class AttendanceReport < ApplicationRecord
  enum :event_type, { sunday_service: 0, community_group: 1, discipleship_meeting: 2 }
end
