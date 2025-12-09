class Member < ApplicationRecord
  enum :status, { guest: 0, prospective: 1, active: 2, inactive: 3, archived: 4 }

  has_many :team_members, dependent: :destroy
  has_many :teams, through: :team_members
  has_many :group_members, dependent: :destroy
  has_many :groups, through: :group_members

  def full_name
    "#{first_name} #{last_name}"
  end

  def full_name_with_status
    "#{full_name} (#{status.titleize})"
  end

  def full_address
    if address_2.present?
      "#{address_1}, #{address_2}, #{city}, #{state}, #{postal_code}"
    else
      "#{address_1}, #{city}, #{state}, #{postal_code}"
    end
  end
end
