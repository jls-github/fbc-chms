class Family < ApplicationRecord
  has_many :members, dependent: :nullify
end