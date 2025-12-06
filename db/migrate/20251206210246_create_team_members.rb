class CreateTeamMembers < ActiveRecord::Migration[8.0]
  def change
    create_table :team_members do |t|
      t.references :team, null: false, foreign_key: true
      t.references :member, null: false, foreign_key: true
      t.integer :status

      t.timestamps
    end
  end
end
