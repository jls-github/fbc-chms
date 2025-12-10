class AddTeamLeaderToTeams < ActiveRecord::Migration[8.0]
  def change
    add_column :teams, :team_leader_id, :integer
  end
end
