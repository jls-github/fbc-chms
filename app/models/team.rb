class Team < ApplicationRecord
  has_many :team_members, dependent: :destroy
  has_many :members, through: :team_members
  belongs_to :team_leader, class_name: "Member", required: false, foreign_key: "team_leader_id"

  def leader_name
    team_leader ? team_leader.full_name : "No Leader Assigned"
  end
end
