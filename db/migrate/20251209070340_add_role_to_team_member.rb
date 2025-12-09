class AddRoleToTeamMember < ActiveRecord::Migration[8.0]
  def change
    add_column :team_members, :role, :string
  end
end
