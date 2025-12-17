class CreateAttendanceReports < ActiveRecord::Migration[8.0]
  def change
    create_table :attendance_reports do |t|
      t.integer :event_type
      t.date :date
      t.integer :attendance

      t.timestamps
    end
  end
end
