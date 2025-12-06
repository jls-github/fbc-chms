class Team < ApplicationRecord
  has_many :team_members, dependent: :destroy
  has_many :members, through: :team_members
end
