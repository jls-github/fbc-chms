class Member < ApplicationRecord
  has_many :team_members, dependent: :destroy
  has_many :teams, through: :team_members
  has_many :group_members, dependent: :destroy
  has_many :groups, through: :group_members

  def full_name
    "#{first_name} #{last_name}"
  end
end
