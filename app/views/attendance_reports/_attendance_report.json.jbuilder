json.extract! attendance_report, :id, :event_type, :date, :attendance, :created_at, :updated_at
json.url attendance_report_url(attendance_report, format: :json)
