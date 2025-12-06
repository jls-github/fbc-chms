class CreateGroups < ActiveRecord::Migration[8.0]
  def change
    create_table :groups do |t|
      t.string :name
      t.string :meeting_time
      t.string :meeting_location

      t.timestamps
    end
  end
end
